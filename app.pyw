import random
from venv import logger
from flask import Flask, current_app, render_template, request, redirect, url_for, flash, send_file, jsonify, send_from_directory, make_response
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from barcode import Code128
from barcode.writer import ImageWriter
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from io import BytesIO, open_code
from functools import wraps
import json
import os
import glob
import subprocess
import platform
import shutil
import tempfile
import re
import threading
import time
import sqlite3
import base64
import pandas as pd
import socket
import webbrowser
import logging
from datetime import datetime
from PIL import Image

app = Flask(__name__, template_folder='templates')
app.secret_key = 'ViaCores'

# Configura logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

DATABASE = 'estoque.db'
UPLOAD_FOLDER = os.path.join('static', 'Uploads')

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
CONFIG_FILE = 'config.json'

# Configurações
IMAGE_DIR = r"C:\Users\Via Cores - ADM\Documents\Impressao"  # Pasta onde as imagens originais são buscadas
SHARED_DIR = r"C:\Users\Via Cores - ADM\Documents\Temp"  # Pasta para pastas temporárias
SHARE_NAME = "TEMP"  # Nome do compartilhamento de rede
SERVER_NAME = "Via_Cores"  # Nome do servidor

# Carregar configuração inicial
CONFIG_FILE = "config.json"
def load_config():
    global IMAGE_DIR
    try:
        with open(CONFIG_FILE, 'r') as f:
            config = json.load(f)
            IMAGE_DIR = config.get('IMAGE_DIR', r"C:\Users\Via Cores - ADM\Documents\Impressao")
    except FileNotFoundError:
        config = {'IMAGE_DIR': IMAGE_DIR}
        with open(CONFIG_FILE, 'w') as f:
            json.dump(config, f)
load_config()

def try_delete_temp_folder(temp_dir, max_attempts=120, delay=120):
    """
    Tenta excluir a pasta temporária após um atraso, verificando se está em uso.
    max_attempts: número máximo de tentativas
    delay: segundos entre tentativas
    """
    logger.debug(f"Iniciando exclusão automática para {temp_dir}")
    for attempt in range(max_attempts):
        time.sleep(delay)
        try:
            if not os.path.exists(temp_dir):
                logger.info(f"Pasta {temp_dir} já foi excluída.")
                return
            # Tenta renomear para verificar se está em uso
            temp_test = temp_dir + "_test"
            os.rename(temp_dir, temp_test)
            os.rename(temp_test, temp_dir)
            # Se chegou aqui, a pasta não está em uso
            shutil.rmtree(temp_dir, ignore_errors=True)
            logger.info(f"Pasta temporária {temp_dir} excluída automaticamente na tentativa {attempt + 1}.")
            return
        except (OSError, PermissionError) as e:
            logger.debug(f"Tentativa {attempt + 1} falhou para {temp_dir}: {str(e)}")
            if attempt == max_attempts - 1:
                logger.warning(f"Não foi possível excluir {temp_dir} após {max_attempts} tentativas.")
        except Exception as e:
            logger.error(f"Erro inesperado ao excluir {temp_dir}: {str(e)}")
            return

def ensure_shared_dir():
    try:
        os.makedirs(IMAGE_DIR, exist_ok=True)
        os.makedirs(SHARED_DIR, exist_ok=True)
        logger.info(f"Diretórios criados: {IMAGE_DIR}, {SHARED_DIR}")

        for directory in [IMAGE_DIR, SHARED_DIR]:
            subprocess.run(
                f'icacls "{directory}" /grant Todos:(OI)(CI)F /T',
                shell=True,
                check=True,
                capture_output=True
            )
            logger.info(f"Permissões ajustadas para {directory}.")

        try:
            subprocess.run(
                f'net share {SHARE_NAME}="{SHARED_DIR}" /grant:Todos,FULL',
                shell=True,
                check=True,
                capture_output=True
            )
            logger.info(f"Compartilhamento {SHARE_NAME} criado ou já existe.")
        except subprocess.CalledProcessError as e:
            logger.warning(f"Não foi possível configurar o compartilhamento {SHARE_NAME}. Configure manualmente: {e}")
    except Exception as e:
        logger.error(f"Erro ao configurar diretórios: {str(e)}")
        
def cleanup_old_temp_folders():
    """Exclui pastas temporárias com mais de 2 minutos."""
    try:
        for folder in glob.glob(os.path.join(SHARED_DIR, "temp_*")):
            if os.path.isdir(folder):
                creation_time = os.path.getctime(folder)
                if time.time() - creation_time > 200:  # 2 minutos
                    shutil.rmtree(folder, ignore_errors=True)
                    logger.info(f"Excluída pasta temporária antiga: {folder}")
    except Exception as e:
        logger.error(f"Erro ao limpar pastas temporárias antigas: {str(e)}")

# Executa na inicialização
ensure_shared_dir()
cleanup_old_temp_folders()

def open_folder(path):
    try:
        if not os.path.exists(path):
            raise FileNotFoundError(f"Pasta não encontrada: {path}")
        if platform.system() == "Windows":
            os.startfile(path)
        elif platform.system() == "Darwin":
            subprocess.run(['open', path], check=True)
        else:
            subprocess.run(['xdg-open', path], check=True)
        print(f'[Server] Pasta aberta com sucesso: {path}')
    except Exception as e:
        print(f'[Server] Erro ao abrir pasta {path}: {str(e)}')
        raise
    
def load_image_dir():
    global IMAGE_DIR
    try:
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, 'r') as f:
                config = json.load(f)
                IMAGE_DIR = config.get('image_dir', IMAGE_DIR)
                print(f"[Server] Diretório de imagens carregado: {IMAGE_DIR}")
    except Exception as e:
        print(f"[Server] Erro ao carregar diretório de imagens do config: {str(e)}")

def save_image_dir(new_dir):
    global IMAGE_DIR
    try:
        config = {'image_dir': new_dir}
        with open(CONFIG_FILE, 'w') as f:
            json.dump(config, f)
        IMAGE_DIR = new_dir
        print(f"[Server] Diretório de imagens atualizado: {IMAGE_DIR}")
    except Exception as e:
        print(f"[Server] Erro ao salvar diretório de imagens: {str(e)}")
        raise

# Carregar o diretório de imagens ao iniciar
load_image_dir()


if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

    try:
        conn.execute("ALTER TABLE estoque ADD COLUMN reservado INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass  # coluna já existe

valid_caixas = [str(num) for num in range(1, 31)] + ['N/A', 'F/C']
def normalize_caixa(caixa_input):
    if not caixa_input or caixa_input.strip().upper() in ['N/A', 'F/C']:
        return caixa_input.strip().upper() if caixa_input.strip().upper() in ['N/A', 'F/C'] else 'N/A'
    caixa_input = caixa_input.strip().upper()
    if caixa_input.isdigit() and 1 <= int(caixa_input) <= 30:
        return caixa_input
    return caixa_input if caixa_input in valid_caixas else None

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def validate_quantity(quantity, sku, index, error_messages):
    """Valida a quantidade e retorna o valor inteiro ou None se inválido."""
    try:
        qty = int(float(quantity))
        if qty <= 0:
            error_messages.append(f'Linha {index}: Quantidade inválida para SKU {sku}. Deve ser maior que zero.')
            print(f'[Server] Rejeitado: SKU={sku}, Linha={index}, Motivo=Quantidade inválida (<= 0)')
            return None
        return qty
    except (ValueError, TypeError):
        error_messages.append(f'Linha {index}: Quantidade inválida para SKU {sku}. Deve ser um número.')
        print(f'[Server] Rejeitado: SKU={sku}, Linha={index}, Motivo=Quantidade não numérica')
        return None

def create_tables():
    with get_db() as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS estoque (
                codigo TEXT PRIMARY KEY,
                quantidade INTEGER NOT NULL DEFAULT 0,
                caixa TEXT
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT,
                role TEXT NOT NULL
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sku TEXT NOT NULL,
                transaction_type TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                date TEXT NOT NULL,
                caixa TEXT,
                FOREIGN KEY (sku) REFERENCES estoque (codigo)
            )
        ''')
        cursor = conn.cursor()
        admin_password = generate_password_hash('admin123')
        impressao_password = generate_password_hash('impressao123')  # Senha para impressao
        cursor.execute('INSERT OR REPLACE INTO users (username, password_hash, role) VALUES (?, ?, ?)',
                       ('admin', admin_password, 'admin'))
        cursor.execute('INSERT OR REPLACE INTO users (username, password_hash, role) VALUES (?, ?, ?)',
                       ('consulta', '', 'consulta'))
        cursor.execute('INSERT OR REPLACE INTO users (username, password_hash, role) VALUES (?, ?, ?)',
                       ('impressao', impressao_password, 'impressao'))  # Novo usuário impressao
        try:
            cursor.execute("ALTER TABLE transactions ADD COLUMN caixa TEXT")
        except sqlite3.OperationalError:
            pass
        conn.commit()

create_tables()

def get_items():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT codigo, quantidade, COALESCE(caixa, 'N/A') as caixa FROM estoque ORDER BY codigo ASC")
        return [{'codigo': row['codigo'], 'quantidade': row['quantidade'], 'caixa': row['caixa']} for row in cursor.fetchall()]

class User(UserMixin):
    def __init__(self, id, username, role):
        self.id = id
        self.username = username
        self.role = role

with get_db() as conn:
    try:
        conn.execute("ALTER TABLE estoque ADD COLUMN reservado INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass  # Coluna já existe
@login_manager.user_loader
def load_user(user_id):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, username, role FROM users WHERE id = ?", (user_id,))
        user = cursor.fetchone()
        if user:
            return User(user[0], user[1], user[2])
        return None

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        redirect_url = url_for('consulta' if current_user.role == 'consulta' else 'image_index' if current_user.role in ['impressao', 'admin'] else 'index')
        print(f'[Server] Usuário já autenticado: {current_user.username}, redirecionando para {redirect_url}')
        return jsonify({'redirect': redirect_url}) if request.method == 'POST' else redirect(redirect_url)
    
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password', '')

        if not username:
            print('[Server] Login falhou: Nenhum usuário fornecido.')
            return jsonify({'success': False, 'message': 'Usuário não fornecido.'}), 400

        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, username, password_hash, role FROM users WHERE username = ?", (username,))
            user = cursor.fetchone()
            
            print(f'[Server] Busca por usuário: {username}, Encontrado: {bool(user)}')
            if not user:
                print(f'[Server] Login falhou: Usuário {username} não encontrado.')
                return jsonify({'success': False, 'message': 'Usuário não encontrado.'}), 401
            
            if username == 'consulta':  # Login sem senha para consulta
                print(f'[Server] Verificando login {username}: password_hash="{user[2]}"')
                if not user[2] or user[2] == '':
                    user_obj = User(user[0], user[1], user[3])
                    login_user(user_obj)
                    print(f'[Server] Login bem-sucedido: Usuário {username} ({user[3].capitalize()})')
                    return jsonify({'success': True, 'redirect': url_for('consulta'), 'message': f'Login bem-sucedido como {username.capitalize()}!'})
                else:
                    print(f'[Server] Login falhou: Usuário {username} tem password_hash inesperado.')
            
            if username in ['admin', 'impressao'] and user[2]:  # Login com senha para admin e impressao
                print(f'[Server] Verificando senha para {username}: Hash armazenado existe, comparando...')
                if check_password_hash(user[2], password):
                    user_obj = User(user[0], user[1], user[3])
                    login_user(user_obj)
                    redirect_url = url_for('index' if username == 'admin' else 'image_index')
                    print(f'[Server] Login bem-sucedido: Usuário {username} ({user[3].capitalize()})')
                    return jsonify({'success': True, 'redirect': redirect_url, 'message': f'Login bem-sucedido como {username.capitalize()}!'})
                else:
                    print(f'[Server] Login falhou: Senha incorreta para {username}.')
            
            print(f'[Server] Login falhou: Condições não atendidas para {username}.')
            return jsonify({'success': False, 'message': 'Usuário ou senha inválidos.'}), 401
    
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    print(f'[Server] Logout: Usuário {current_user.username}')
    logout_user()
    flash('Você foi desconectado.', 'info')
    return redirect(url_for('login'))

@app.route('/')
@login_required
def index():
    if current_user.role != 'admin':
        flash('Acesso negado: Somente administradores podem acessar esta página.', 'error')
        print(f'[Server] Acesso negado para {current_user.username} (role={current_user.role}) em /')
        return redirect(url_for('consulta' if current_user.role == 'consulta' else 'login'))
    total_items = 0
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT SUM(quantidade) FROM estoque")
        result = cursor.fetchone()
        total_items = result[0] if result[0] is not None else 0
    print(f'[Server] Acesso ao index: Usuário {current_user.username}, Total itens={total_items}')
    return render_template('index.html', total_items=total_items)	

@app.route('/image_index')
@login_required
def image_index():
    if current_user.role not in ['admin', 'impressao']:
        flash('Acesso negado: Somente administradores e usuários de impressão podem acessar esta página.', 'error')
        print(f'[Server] Acesso negado para {current_user.username} (role={current_user.role}) em /image_index')
        return redirect(url_for('login'))  # Sempre redireciona para /login
    
    skus_que_precisam_caixa_prefixos = ["PV", "PH", "FF", "FH", "RV", "PR"]
    skus_sem_caixa = ["PC", "CL", "KD", "KC", "VC", "TP"]
    valid_prefixes = skus_que_precisam_caixa_prefixos + skus_sem_caixa

    prefix_filter = request.args.get('prefix', '').strip().upper()
    tema_filter = request.args.get('tema', '').strip().upper()

    with get_db() as conn:
        cursor = conn.cursor()
        query = "SELECT codigo, quantidade, COALESCE(caixa, 'N/A') as caixa, reservado FROM estoque"
        params = []
        conditions = []

        if prefix_filter and prefix_filter in valid_prefixes:
            conditions.append("codigo LIKE ?")
            params.append(f"{prefix_filter}%")
        if tema_filter and len(tema_filter) == 2:
            conditions.append("codigo LIKE ?")
            params.append(f"{prefix_filter}{tema_filter}%")

        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        query += " ORDER BY codigo ASC"

        cursor.execute(query, params)
        items = cursor.fetchall()

    sku_images = []
    for item in items:
        sku = item['codigo']
        image_url = None
        for ext in ['jpg', 'jpeg', 'png', 'gif']:
            filename = f"{sku}.{ext}"
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            if os.path.exists(file_path):
                image_url = url_for('get_image', sku=sku)
                break
        sku_images.append({
            'codigo': sku,
            'quantidade': item['quantidade'],
            'caixa': item['caixa'],
            'image_url': image_url
        })

    print(f'[Server] Acesso ao image_index: Usuário {current_user.username}, SKUs={len(sku_images)}, Prefixo={prefix_filter}, Tema={tema_filter}')
    return render_template('image_index.html', 
                         sku_images=sku_images, 
                         valid_prefixes=valid_prefixes, 
                         prefix_filter=prefix_filter, 
                         tema_filter=tema_filter)
@app.route('/consulta')
@login_required
def consulta():
    if current_user.role != 'consulta':
        flash('Acesso negado: Esta página é exclusiva para o usuário Consulta.', 'error')
        print(f'[Server] Acesso negado para {current_user.username} (role={current_user.role}) em /consulta')
        return redirect(url_for('index' if current_user.role == 'admin' else 'login'))  # Fixed line
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT codigo, quantidade, caixa, reservado FROM estoque ORDER BY codigo ASC")
        items = cursor.fetchall()
        total_items = sum(item['quantidade'] for item in items)
    print(f'[Server] Acesso à consulta: Usuário {current_user.username}, Itens={len(items)}')
    return render_template('consulta.html', items=items, total_items=total_items)


@app.route('/upload_image', methods=['POST'])
@login_required
def upload_image():
    if current_user.role != 'admin':
        print(f'[Server] Acesso negado para {current_user.username} em upload_image')
        return jsonify({'success': False, 'error': 'Acesso negado: Somente administradores podem importar imagens.'}), 403

    sku = request.form.get('sku', '').strip().upper()
    if not sku:
        print('[Server] Erro: SKU não fornecido')
        return jsonify({'success': False, 'error': 'SKU é obrigatório.'}), 400

    if 'image' not in request.files:
        print(f'[Server] Erro: Nenhuma imagem fornecida para SKU={sku}')
        return jsonify({'success': False, 'error': 'Nenhuma imagem selecionada.'}), 400

    file = request.files['image']
    if file.filename == '':
        print(f'[Server] Erro: Nome do arquivo vazio para SKU={sku}')
        return jsonify({'success': False, 'error': 'Nenhuma imagem selecionada.'}), 400

    if file and allowed_file(file.filename):
        ext = file.filename.rsplit('.', 1)[1].lower()
        filename = secure_filename(f"{sku}.{ext}")
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        try:
            img = Image.open(file)
            img.verify()
            file.seek(0)
            file.save(file_path)
            print(f'[Server] Imagem salva: SKU={sku}, Formato={ext}, Caminho={file_path}')
            return jsonify({'success': True, 'message': f'Imagem para {sku} importada com sucesso!'})
        except Exception as e:
            print(f'[Server] Erro: Imagem inválida para SKU={sku}, Erro={str(e)}')
            return jsonify({'success': False, 'error': f'Imagem inválida: {str(e)}'}), 400
    else:
        print(f'[Server] Erro: Formato de arquivo inválido para SKU={sku}')
        return jsonify({'success': False, 'error': 'Formato de arquivo inválido. Use PNG, JPG, JPEG ou GIF.'}), 400

@app.route('/get_image/<sku>')
@login_required
def get_image(sku):
    for ext in ['jpg', 'jpeg', 'png', 'gif']:
        filename = f"{sku}.{ext}"
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        if os.path.exists(file_path):
            print(f'[Server] Servindo imagem para SKU={sku}, Formato={ext}, Caminho={file_path}')
            response = make_response(send_from_directory(app.config['UPLOAD_FOLDER'], filename))
            response.headers['Cache-Control'] = 'public, max-age=86400'
            return response
    placeholder_path = os.path.join('static', 'img', 'placeholder.png')
    if os.path.exists(placeholder_path):
        print(f'[Server] Imagem não encontrada para SKU={sku}, retornando placeholder em {placeholder_path}')
        response = make_response(send_file(placeholder_path, mimetype='image/png'))
        response.headers['Cache-Control'] = 'public, max-age=86400'
        return response
    else:
        print(f'[Server] Erro: Imagem e placeholder não encontrados para SKU={sku}, Placeholder={placeholder_path}')
        return jsonify({'error': 'Imagem não encontrada'}), 404

@app.route('/add_remove_item', methods=['POST'])
@login_required
def add_remove_item():
    if current_user.role != 'admin':
        print(f'[Server] Acesso negado para {current_user.username} em add_remove_item')
        return jsonify({'success': False, 'error': 'Acesso negado: Somente administradores podem adicionar ou remover itens.'}), 403

    sku = request.form.get('barcode', '').strip().upper()
    try:
        quantity = int(request.form.get('quantity', 0))
    except (ValueError, TypeError):
        print(f'[Server] Erro: Quantidade inválida para SKU={sku}')
        return jsonify({'success': False, 'error': 'Quantidade inválida. Deve ser um número inteiro.'}), 400
    caixa = request.form.get('caixa', '').strip().upper()
    action = 'add' if 'add' in request.form else 'remove' if 'remove' in request.form else None

    if not sku:
        print(f'[Server] Erro: SKU vazio')
        return jsonify({'success': False, 'error': 'SKU é obrigatório.'}), 400
    if quantity <= 0:
        print(f'[Server] Erro: Quantidade={quantity} para SKU={sku}')
        return jsonify({'success': False, 'error': 'Quantidade deve ser maior que zero.'}), 400
    if not action:
        print(f'[Server] Erro: Ação inválida para SKU={sku}')
        return jsonify({'success': False, 'error': 'Ação inválida (especifique "add" ou "remove").'}), 400

    skus_que_precisam_caixa_prefixos = ["PV", "PH", "FF", "FH", "RV", "PR"]
    skus_sem_caixa = ["PC", "CL", "KD", "KC", "VC", "TP"]
    sku_prefixo = sku[:2]
    current_date = datetime.now().strftime('%d/%m/%Y')

    normalized_caixa = normalize_caixa(caixa)
    if normalized_caixa is None and caixa not in ['N/A', '']:
        print(f'[Server] Erro: Caixa inválida ({caixa}) para SKU={sku}')
        return jsonify({'success': False, 'error': 'Caixa inválida. Use números de 1 a 30, N/A ou F/C.'}), 400
    caixa = normalized_caixa or 'N/A'

    if sku_prefixo in skus_sem_caixa:
        caixa = 'N/A'

    if sku_prefixo not in (skus_que_precisam_caixa_prefixos + skus_sem_caixa):
        print(f'[Server] Erro: Prefixo inválido ({sku_prefixo}) para SKU={sku}')
        return jsonify({'success': False, 'error': f'Prefixo do SKU inválido. Prefixos válidos: {", ".join(skus_que_precisam_caixa_prefixos + skus_sem_caixa)}.'}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        try:
            if action == 'add':
                cursor.execute("SELECT quantidade, caixa FROM estoque WHERE codigo = ?", (sku,))
                item = cursor.fetchone()
                if item:
                    current_caixa = item['caixa'] or 'N/A'
                    if sku_prefixo in skus_que_precisam_caixa_prefixos:
                        if caixa == 'N/A':
                            print(f'[Server] Erro: SKU={sku} requer caixa válida, fornecido={caixa}')
                            return jsonify({'success': False, 'error': f'SKU {sku} requer uma caixa válida (1-30 ou F/C). Caixa atual: {current_caixa}.'}), 400
                        if current_caixa != 'N/A' and caixa != current_caixa:
                            print(f'[Server] Erro: Caixa mismatch para SKU={sku}, Caixa fornecida={caixa}, Caixa no estoque={current_caixa}')
                            return jsonify({'success': False, 'error': f'Caixa {caixa} não corresponde à caixa do estoque ({current_caixa}).'}), 400
                        cursor.execute("UPDATE estoque SET quantidade = quantidade + ? WHERE codigo = ? AND caixa = ?",
                                      (quantity, sku, current_caixa))
                    else:
                        cursor.execute("UPDATE estoque SET quantidade = quantidade + ? WHERE codigo = ?",
                                      (quantity, sku))
                else:
                    if sku_prefixo in skus_que_precisam_caixa_prefixos and caixa == 'N/A':
                        print(f'[Server] Erro: SKU={sku} requer caixa válida, fornecido={caixa}')
                        return jsonify({'success': False, 'error': f'SKU {sku} requer uma caixa válida (1-30 ou F/C). Caixa atual: N/A.'}), 400
                    cursor.execute("INSERT INTO estoque (codigo, quantidade, caixa) VALUES (?, ?, ?)",
                                  (sku, quantity, caixa))

                if cursor.rowcount == 0:
                    print(f'[Server] Erro: Falha ao adicionar SKU={sku}, Quantidade={quantity}')
                    conn.rollback()
                    return jsonify({'success': False, 'error': f'Não foi possível adicionar {quantity} de {sku}.'}), 400

                cursor.execute("INSERT INTO transactions (sku, transaction_type, quantity, date, caixa) VALUES (?, ?, ?, ?, ?)",
                              (sku, 'entrada', quantity, current_date, caixa))

                conn.commit()
                print(f'[Server] Adição bem-sucedida: SKU={sku}, Quantidade={quantity}, Caixa={caixa}')
                return jsonify({'success': True, 'message': f'Item {sku} adicionado com sucesso!'})

            elif action == 'remove':
                cursor.execute("SELECT quantidade, caixa FROM estoque WHERE codigo = ?", (sku,))
                item = cursor.fetchone()
                if not item:
                    print(f'[Server] Erro: SKU={sku} não encontrado')
                    return jsonify({'success': False, 'error': f'SKU {sku} não encontrado no estoque.'}), 404
                if item['quantidade'] < quantity:
                    print(f'[Server] Erro: Quantidade insuficiente para SKU={sku}, Disponível={item["quantidade"]}, Solicitado={quantity}')
                    return jsonify({'success': False, 'error': f'Quantidade insuficiente para {sku}. Disponível: {item["quantidade"]}.'}), 400

                current_caixa = item['caixa'] or 'N/A'
                # Ignorar validação de caixa; usar a caixa atual do estoque
                cursor.execute("UPDATE estoque SET quantidade = quantidade - ? WHERE codigo = ?",
                              (quantity, sku))

                if cursor.rowcount == 0:
                    print(f'[Server] Erro: Falha ao remover SKU={sku}, Quantidade={quantity}')
                    conn.rollback()
                    return jsonify({'success': False, 'error': f'Não foi possível remover {quantity} de {sku}.'}), 400

                cursor.execute("INSERT INTO transactions (sku, transaction_type, quantity, date, caixa) VALUES (?, ?, ?, ?, ?)",
                              (sku, 'saida', quantity, current_date, current_caixa))

                cursor.execute("SELECT quantidade FROM estoque WHERE codigo = ?", (sku,))
                result = cursor.fetchone()
                if result and result['quantidade'] <= 0:
                    cursor.execute("DELETE FROM estoque WHERE codigo = ?", (sku,))

                conn.commit()
                print(f'[Server] Remoção bem-sucedida: SKU={sku}, Quantidade={quantity}, Caixa={current_caixa}')
                return jsonify({'success': True, 'message': f'Item {sku} removido com sucesso!'})

        except Exception as e:
            conn.rollback()
            print(f'[Server] Erro interno ao processar SKU={sku}, Ação={action}: {str(e)}')
            return jsonify({'success': False, 'error': f'Erro interno ao processar a operação: {str(e)}'}), 500

@app.route('/bulk_add_remove', methods=['POST'])
@login_required
def bulk_add_remove():
    if current_user.role != 'admin':
        flash('Acesso negado: Somente administradores podem executar operações em massa.', 'error')
        print(f'[Server] Acesso negado para {current_user.username} em bulk_add_remove')
        return redirect(url_for('index'))

    bulk_items = request.form['bulk_items'].strip()
    action = 'bulk_add' if 'bulk_add' in request.form else 'bulk_remove'
    current_date = datetime.now().strftime('%d/%m/%Y')

    skus_que_precisam_caixa_prefixos = ["PV", "PH", "FF", "FH", "RV", "PR"]
    skus_sem_caixa = ["PC", "CL", "KD", "KC", "VC", "TP"]

    with get_db() as conn:
        cursor = conn.cursor()
        for line in bulk_items.split('\n'):
            if not line.strip():
                continue
            try:
                parts = line.split(',')
                sku = parts[0].strip().upper()
                quantity = int(parts[1].strip())
                if quantity <= 0:
                    flash(f'Quantidade inválida para {sku}: deve ser maior que zero.', 'error')
                    continue

                sku_prefixo = sku[:2]
                caixa = 'N/A'
                if len(parts) >= 3:
                    caixa_input = parts[2].strip().upper()
                    normalized_caixa = normalize_caixa(caixa_input)
                    if normalized_caixa is None:
                        flash(f'Caixa inválida para {sku}: deve ser um número de 1 a 30, N/A ou F/C.', 'error')
                        continue
                    caixa = normalized_caixa

                if sku_prefixo not in (skus_que_precisam_caixa_prefixos + skus_sem_caixa):
                    flash(f'SKU {sku} possui prefixo inválido. Prefixos válidos: PC, CL, KD, KC, VC, PV, PH, FF, FH, RV, PR.', 'error')
                    continue

                if sku_prefixo in skus_sem_caixa:
                    caixa = 'N/A'

                caixa_to_log = caixa

                if action == 'bulk_add':
                    cursor.execute("INSERT INTO transactions (sku, transaction_type, quantity, date, caixa) VALUES (?, ?, ?, ?, ?)",
                                   (sku, 'entrada', quantity, current_date, caixa_to_log))
                    cursor.execute("""
                        INSERT INTO estoque (codigo, quantidade, caixa) 
                        VALUES (?, ?, ?) 
                        ON CONFLICT(codigo) DO UPDATE SET quantidade = quantidade + ?, caixa = ?
                    """, (sku, quantity, caixa, quantity, caixa))

                elif action == 'bulk_remove':
                    cursor.execute("SELECT quantidade, caixa FROM estoque WHERE codigo = ?", (sku,))
                    item = cursor.fetchone()
                    if not item:
                        flash(f'SKU {sku} não encontrado no estoque.', 'error')
                        continue
                    if item['quantidade'] < quantity:
                        flash(f'Quantidade insuficiente para {sku}. Disponível: {item["quantidade"]}.', 'error')
                        continue
                    current_caixa = item['caixa'] or 'N/A'
                    if sku_prefixo in skus_que_precisam_caixa_prefixos:
                        if caixa != current_caixa:
                            flash(f'Caixa {caixa} não corresponde à caixa do estoque ({current_caixa}) para {sku}.', 'error')
                            continue
                        cursor.execute("UPDATE estoque SET quantidade = quantidade - ? WHERE codigo = ? AND caixa = ?",
                                      (quantity, sku, current_caixa))
                    else:
                        cursor.execute("UPDATE estoque SET quantidade = quantidade - ? WHERE codigo = ?",
                                      (quantity, sku))

                    if cursor.rowcount == 0:
                        flash(f'Não foi possível remover {quantity} de {sku} (quantidade insuficiente).', 'error')
                        continue

                    cursor.execute("INSERT INTO transactions (sku, transaction_type, quantity, date, caixa) VALUES (?, ?, ?, ?, ?)",
                                   (sku, 'saida', quantity, current_date, current_caixa))

                    cursor.execute("SELECT quantidade FROM estoque WHERE codigo = ?", (sku,))
                    result = cursor.fetchone()
                    if result and result['quantidade'] <= 0:
                        cursor.execute("DELETE FROM estoque WHERE codigo = ?", (sku,))

            except ValueError:
                flash(f'Erro ao processar linha: {line}. Formato esperado: SKU,QUANTIDADE[,CAIXA]', 'error')
                continue
            except IndexError:
                flash(f'Erro ao processar linha: {line}. Formato esperado: SKU,QUANTIDADE[,CAIXA]', 'error')
                continue

        conn.commit()
        flash(f'Operação em massa de {"adição" if action == "bulk_add" else "remoção"} concluída!', 'info')
    return redirect(url_for('index'))

@app.route('/print_barcode', methods=['GET', 'POST'])
@login_required
def print_barcode():
    if current_user.role != 'admin':
        flash('Acesso negado: Somente administradores podem imprimir códigos de barras.', 'error')
        print(f'[Server] Acesso negado para {current_user.username} em print_barcode')
        return redirect(url_for('index'))

    codes = []
    if request.method == 'POST':
        skus = request.form.getlist('sku[]')
        try:
            quantity = int(request.form.get('quantity', 1))
        except ValueError:
            flash('Quantidade inválida.', 'error')
            return redirect(url_for('index'))
        if not skus or quantity <= 0:
            flash('Por favor, forneça pelo menos um SKU e uma quantidade válida.', 'error')
            return redirect(url_for('index'))

        for sku in skus:
            sku = sku.strip().upper()
            if not sku:
                continue
            for _ in range(quantity):
                code128 = Code128(sku, writer=ImageWriter())
                buffer = BytesIO()
                code128.write(buffer)
                buffer.seek(0)
                image_data = buffer.getvalue()
                image_base64 = base64.b64encode(image_data).decode('utf-8')
                image_uri = f"data:image/png;base64,{image_base64}"
                codes.append(image_uri)
        return render_template('print_barcode.html', codes=codes, sku=','.join(skus), quantity=quantity)
    else:
        sku = request.args.get('sku', '').strip().upper()
        try:
            quantity = int(request.args.get('quantity', 1))
        except ValueError:
            flash('Quantidade inválida.', 'error')
            return redirect(url_for('index'))
        if not sku or quantity <= 0:
            flash('Por favor, forneça um SKU e uma quantidade válida.', 'error')
            return redirect(url_for('index'))

        for _ in range(quantity):
            code128 = Code128(sku, writer=ImageWriter())
            buffer = BytesIO()
            code128.write(buffer)
            buffer.seek(0)
            image_data = buffer.getvalue()
            image_base64 = base64.b64encode(image_data).decode('utf-8')
            image_uri = f"data:image/png;base64,{image_base64}"
            codes.append(image_uri)
        return render_template('print_barcode.html', codes=codes, sku=sku, quantity=quantity)

@app.route('/search_item', methods=['GET'])
@login_required
def search_item():
    try:
        input_raw = request.args.get('sku', '').upper()
        termos = [t.strip() for t in input_raw.split(',') if t.strip()]
        if not termos:
            print(f'[Server] Erro: Nenhum SKU fornecido para busca por {current_user.username} (role: {current_user.role})')
            return jsonify({'items': []}), 200

        items = []
        skus_que_precisam_caixa_prefixos = ["PV", "PH", "FF", "FH", "RV", "PR"]
        kit_prefixes = ["PVSE", "PCRV", "KCMD"]

        with get_db() as conn:
            cursor = conn.cursor()
            for termo in termos:
                print(f'[Server] Processando termo: {termo} para {current_user.username} (role: {current_user.role})')
                
                # Verifica se é um SKU completo (mínimo 5 caracteres ou kit)
                is_complete_sku = len(termo) >= 5 or termo in kit_prefixes or any(termo.startswith(prefix) for prefix in skus_que_precisam_caixa_prefixos)

                if is_complete_sku:
                    if current_user.role == 'impressao':
                        # Busca exata para usuário de impressão
                        cursor.execute("SELECT codigo, quantidade, COALESCE(caixa, 'N/A') as caixa, reservado FROM estoque WHERE codigo = ?", (termo,))
                        row = cursor.fetchone()
                        if row:
                            items.append({
                                'codigo': row['codigo'],
                                'quantidade': row['quantidade'],
                                'caixa': row['caixa'],
                                'reservado': row['reservado']
                            })
                            print(f'[Server] Encontrado SKU exato: {row["codigo"]} para termo {termo} (impressao)')
                        else:
                            print(f'[Server] Nenhum SKU exato encontrado para termo {termo} (impressao)')
                    else:
                        # Busca exata + prefixo para admin/consulta
                        cursor.execute("SELECT codigo, quantidade, COALESCE(caixa, 'N/A') as caixa, reservado FROM estoque WHERE codigo = ?", (termo,))
                        row = cursor.fetchone()
                        if row:
                            items.append({
                                'codigo': row['codigo'],
                                'quantidade': row['quantidade'],
                                'caixa': row['caixa'],
                                'reservado': row['reservado']
                            })
                            print(f'[Server] Encontrado SKU exato: {row["codigo"]} para termo {termo} (admin/consulta)')
                        
                        # Busca por prefixo para variações
                        cursor.execute("SELECT codigo, quantidade, COALESCE(caixa, 'N/A') as caixa, reservado FROM estoque WHERE codigo LIKE ?", (f"{termo}%",))
                        for row in cursor.fetchall():
                            if row['codigo'] not in [item['codigo'] for item in items]:  # Evita duplicatas
                                items.append({
                                    'codigo': row['codigo'],
                                    'quantidade': row['quantidade'],
                                    'caixa': row['caixa'],
                                    'reservado': row['reservado']
                                })
                                print(f'[Server] Encontrado SKU por prefixo: {row["codigo"]} para termo {termo} (admin/consulta)')
                else:
                    # Busca ampla para termos genéricos (ex: PV, JD)
                    cursor.execute("SELECT codigo, quantidade, COALESCE(caixa, 'N/A') as caixa, reservado FROM estoque WHERE codigo LIKE ?", (f"%{termo}%",))
                    for row in cursor.fetchall():
                        items.append({
                            'codigo': row['codigo'],
                            'quantidade': row['quantidade'],
                            'caixa': row['caixa'],
                            'reservado': row['reservado']
                        })
                        print(f'[Server] Encontrado SKU por busca ampla: {row["codigo"]} para termo {termo} (role: {current_user.role})')

        print(f'[Server] Busca por SKU: {input_raw}, Resultados: {len(items)} para {current_user.username} (role: {current_user.role})')
        return jsonify({'items': items})

    except Exception as e:
        print(f'[Server] Erro na busca de itens para {current_user.username} (role: {current_user.role}): {str(e)}')
        return jsonify({'items': [], 'error': 'Erro interno ao buscar itens.'}), 500
    

@app.route('/toggle_reserva/<sku>', methods=['POST'])
@login_required
def toggle_reserva(sku):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT reservado FROM estoque WHERE codigo = ?", (sku,))
        item = cursor.fetchone()
        if not item:
            return jsonify({'success': False, 'error': 'SKU não encontrado'}), 404

        novo_valor = 0 if item['reservado'] else 1
        cursor.execute("UPDATE estoque SET reservado = ? WHERE codigo = ?", (novo_valor, sku))
        conn.commit()
        return jsonify({'success': True, 'reservado': novo_valor})

@app.route('/sku_report/<sku>')
@login_required
def sku_report(sku):
    if current_user.role != 'admin':
        flash('Acesso negado: Somente administradores podem visualizar relatórios de SKU.', 'error')
        print(f'[Server] Acesso negado para {current_user.username} em sku_report')
        return redirect(url_for('index'))

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT codigo, quantidade, caixa FROM estoque WHERE codigo = ?", (sku,))
        item = cursor.fetchone()
        if not item:
            flash(f'SKU {sku} não encontrado no estoque.', 'error')
            return redirect(url_for('index'))

        cursor.execute("SELECT transaction_type, quantity, date, caixa FROM transactions WHERE sku = ? ORDER BY date", (sku,))
        transactions = cursor.fetchall()

        total_entries = sum(trans[1] for trans in transactions if trans[0] == 'entrada')
        total_exits = sum(trans[1] for trans in transactions if trans[0] == 'saida')

    skus_que_precisam_caixa_prefixos = ["PV", "PH", "FF", "FH", "RV", "PR"]
    return render_template('sku_report.html', sku=sku, item=item, transactions=transactions,
                           skus_que_precisam_caixa_prefixos=skus_que_precisam_caixa_prefixos,
                           total_entries=total_entries, total_exits=total_exits)

@app.route('/download_sku_report/<sku>')
@login_required
def download_sku_report(sku):
    if current_user.role != 'admin':
        flash('Acesso negado: Somente administradores podem baixar relatórios de SKU.', 'error')
        print(f'[Server] Acesso negado para {current_user.username} em download_sku_report')
        return redirect(url_for('sku_report', sku=sku))

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT codigo, quantidade, caixa FROM estoque WHERE codigo = ?", (sku,))
        item = cursor.fetchone()
        if not item:
            flash(f'SKU {sku} não encontrado no estoque.', 'error')
            return redirect(url_for('sku_report', sku=sku))

        cursor.execute("SELECT transaction_type, quantity, date, caixa FROM transactions WHERE sku = ? ORDER BY date", (sku,))
        transactions = cursor.fetchall()

        total_entries = sum(trans[1] for trans in transactions if trans[0] == 'entrada')
        total_exits = sum(trans[1] for trans in transactions if trans[0] == 'saida')

    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    left_margin = 40
    top_margin = 40
    bottom_margin = 40

    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(width / 2, height - top_margin - 20, f"Relatório de SKU: {sku}")

    c.setFont("Helvetica-Bold", 12)
    c.drawString(left_margin, height - top_margin - 50, "Histórico de Transações")
    y_position = height - top_margin - 70

    skus_que_precisam_caixa_prefixos = ["PV", "PH", "FF", "FH", "RV", "PR"]
    sku_prefixo = sku[:2]

    if transactions:
        c.setFont("Helvetica", 10)
        for transaction in transactions:
            transaction_type = "Entrada" if transaction[0] == 'entrada' else "Saída"
            quantity = transaction[1]
            date = transaction[2]
            caixa = transaction[3] if transaction[3] else "N/A"
            if sku_prefixo in skus_que_precisam_caixa_prefixos:
                line = f"{transaction_type} {date} - {quantity} unidade{'s' if quantity != 1 else ''} (Caixa: {caixa})"
            else:
                line = f"{transaction_type} {date} - {quantity} unidade{'s' if quantity != 1 else ''}"
            c.drawString(left_margin, y_position, line)
            y_position -= 15
            if y_position < bottom_margin + 50:
                c.showPage()
                c.setFont("Helvetica", 10)
                y_position = height - top_margin
    else:
        c.setFont("Helvetica", 10)
        c.drawString(left_margin, y_position, "Nenhuma transação encontrada para este SKU.")
        y_position -= 15

    y_position -= 20
    c.setFont("Helvetica-Bold", 12)
    c.drawString(left_margin, y_position, f"Total Entradas: {total_entries} unidade{'s' if total_entries != 1 else ''}")
    y_position -= 15
    c.drawString(left_margin, y_position, f"Total Saídas: {total_exits} unidade{'s' if total_exits != 1 else ''}")
    y_position -= 15
    c.drawString(left_margin, y_position, f"Saldo Final: {item[1]} unidade{'s' if item[1] != 1 else ''}")

    c.setFont("Helvetica", 8)
    c.drawCentredString(width / 2, bottom_margin, "ViaCores ERP - Versão 3.2    | Desenvolvido por ViaCores")

    c.showPage()
    c.save()

    buffer.seek(0)
    return send_file(buffer, as_attachment=True, download_name=f'relatorio_{sku}.pdf', mimetype='application/pdf')

@app.route('/all_sku_transactions')
@login_required
def all_sku_transactions():
    if current_user.role != 'admin':
        flash('Acesso negado: Somente administradores podem visualizar este relatório.', 'error')
        print(f'[Server] Acesso negado para {current_user.username} em all_sku_transactions')
        return redirect(url_for('index'))

    termos_raw = request.args.get('sku', '').upper()
    termos = [t.strip() for t in termos_raw.split(',') if t.strip()]
    sku_transactions = {}
    top_exited_items = []

    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("""
            SELECT sku, SUM(quantity) as total_exits
            FROM transactions
            WHERE transaction_type = 'saida'
            GROUP BY sku
            ORDER BY total_exits DESC
            LIMIT 5
        """)
        top_exited_items = [(row['sku'], row['total_exits']) for row in cursor.fetchall()]

        if termos:
            all_trans = []
            for termo in termos:
                cursor.execute("""
                    SELECT sku, transaction_type, quantity, date, caixa
                    FROM transactions
                    WHERE sku = ? OR sku LIKE ? OR sku LIKE ?
                    ORDER BY date
                """, (termo, f"{termo}%", f"%{termo}%"))
                all_trans.extend(cursor.fetchall())
        else:
            cursor.execute("""
                SELECT sku, transaction_type, quantity, date, caixa
                FROM transactions
                ORDER BY sku, date
            """)
            all_trans = cursor.fetchall()

        for trans in all_trans:
            sku = trans['sku']
            if sku not in sku_transactions:
                cursor.execute("SELECT quantidade, caixa FROM estoque WHERE codigo = ?", (sku,))
                item = cursor.fetchone()
                image_exists = any(os.path.exists(os.path.join(app.config['UPLOAD_FOLDER'], f"{sku}.{ext}")) 
                                   for ext in ['jpg', 'jpeg', 'png', 'gif'])
                sku_transactions[sku] = {
                    'transactions': [],
                    'quantity': item['quantidade'] if item else 0,
                    'caixa': item['caixa'] or 'N/A' if item else 'N/A',
                    'image_url': url_for('get_image', sku=sku) if image_exists else None
                }
            sku_transactions[sku]['transactions'].append({
                'type': trans['transaction_type'],
                'quantity': trans['quantity'],
                'date': trans['date'],
                'caixa': trans['caixa'] or 'N/A'
            })

    print(f'[Server] Relatório de transações: SKUs={len(sku_transactions)}, Filtro={termos_raw}')
    return render_template('all_sku_transactions.html',
                           sku_transactions=sku_transactions,
                           top_exited_items=top_exited_items,
                           skus_que_precisam_caixa_prefixos=["PV", "PH", "FF", "FH", "RV", "PR"])

@app.route('/download_all_sku_transactions')
@login_required
def download_all_sku_transactions():
    if current_user.role != 'admin':
        flash('Acesso negado.', 'error')
        print(f'[Server] Acesso negado para {current_user.username} em download_all_sku_transactions')
        return redirect(url_for('index'))

    termos_raw = request.args.get('sku', '').upper()
    termos = [t.strip() for t in termos_raw.split(',') if t.strip()]
    data_por_sku = {}

    with get_db() as conn:
        cursor = conn.cursor()

        if termos:
            all_trans = []
            for termo in termos:
                cursor.execute("""
                    SELECT sku, transaction_type, quantity, date, caixa
                    FROM transactions
                    WHERE sku = ? OR sku LIKE ? OR sku LIKE ?
                    ORDER BY sku, date
                """, (termo, f"{termo}%", f"%{termo}%"))
                all_trans.extend(cursor.fetchall())
        else:
            cursor.execute("""
                SELECT sku, transaction_type, quantity, date, caixa
                FROM transactions
                ORDER BY sku, date
            """)
            all_trans = cursor.fetchall()

        for trans in all_trans:
            sku = trans['sku']
            if sku not in data_por_sku:
                cursor.execute("SELECT quantidade, caixa FROM estoque WHERE codigo = ?", (sku,))
                item = cursor.fetchone()
                data_por_sku[sku] = {
                    'transactions': [],
                    'quantity': item['quantidade'] if item else 0,
                    'caixa': item['caixa'] or 'N/A' if item else 'N/A'
                }
            data_por_sku[sku]['transactions'].append(trans)

    buffer = BytesIO()
    p = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    y = height - 60

    margin_left = 25

    p.setFont("Courier-Bold", 14)
    p.drawString(margin_left, y, "Relatório de Transações por SKU - ViaCores")
    y -= 30

    for sku, data in data_por_sku.items():
        if y < 100:
            p.showPage()
            p.setFont("Courier", 10)
            y = height - 60

        p.setFont("Courier-Bold", 12)
        p.drawString(margin_left, y, f"SKU: {sku} (Quantidade Atual: {data['quantity']})")
        y -= 20

        p.setFont("Courier-Bold", 10)
        p.drawString(margin_left + 0, y, "TIPO".ljust(12))
        p.drawString(margin_left + 90, y, "DATA".ljust(10))
        p.drawString(margin_left + 180, y, "QUANTIDADE / OBSERVAÇÃO".ljust(50))
        p.drawString(margin_left + 470, y, "CAIXA")
        y -= 15

        p.setFont("Courier", 10)
        for trans in data['transactions']:
            tipo = trans["transaction_type"]
            data_str = trans["date"]
            caixa = trans["caixa"] if trans["caixa"] else "N/A"

            if tipo == 'entrada':
                tipo_str = "Entrada"
                quantidade = f"{trans['quantity']} un"
            elif tipo == 'saida':
                tipo_str = "Saída"
                quantidade = f"{trans['quantity']} un"
            elif tipo == 'transferencia':
                tipo_str = "Transferência"
                quantidade = f"{caixa}"
            else:
                tipo_str = tipo.capitalize()
                quantidade = str(trans["quantity"])

            p.drawString(margin_left + 0, y, tipo_str.ljust(12)[:12])
            p.drawString(margin_left + 90, y, data_str.ljust(10)[:10])
            p.drawString(margin_left + 180, y, quantidade.ljust(50)[:50])
            p.drawString(margin_left + 470, y, caixa[:10])

            y -= 15
            if y < 100:
                p.showPage()
                p.setFont("Courier", 10)
                y = height - 60

        y -= 20

    p.save()
    buffer.seek(0)

    print(f'[Server] PDF de transações gerado: Filtro={termos_raw}')
    return send_file(buffer, as_attachment=True,
                     download_name='relatorio_skus.pdf',
                     mimetype='application/pdf')

@app.route('/update_stock', methods=['POST'])
@login_required
def update_stock():
    if current_user.role != 'admin':
        print(f'[Server] Acesso negado para {current_user.username} em update_stock')
        return jsonify({'success': False, 'message': 'Acesso negado: Somente administradores podem atualizar o estoque.'}), 403

    password = request.json.get('password', '')
    prefixes = request.json.get('prefixes', [])

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT password_hash FROM users WHERE username = 'admin'")
        user = cursor.fetchone()
        if not user or not check_password_hash(user['password_hash'], password):
            return jsonify({'success': False, 'message': 'Senha incorreta.'}), 401

        if not prefixes:
            return jsonify({'success': False, 'message': 'Nenhum prefixo de SKU selecionado para exclusão.'}), 400

        valid_prefixes = ["PV", "PH", "FF", "FH", "RV", "PR", "PC", "CL", "KD", "KC", "VC"]
        invalid_prefixes = [p for p in prefixes if p not in valid_prefixes]
        if invalid_prefixes:
            return jsonify({'success': False, 'message': f'Prefixos inválidos: {", ".join(invalid_prefixes)}.'}), 400

        deleted_skus = []
        for prefix in prefixes:
            cursor.execute("SELECT codigo FROM estoque WHERE codigo LIKE ?", (f"{prefix}%",))
            skus = [row['codigo'] for row in cursor.fetchall()]
            deleted_skus.extend(skus)

            cursor.execute("DELETE FROM estoque WHERE codigo LIKE ?", (f"{prefix}%",))
            cursor.execute("DELETE FROM transactions WHERE sku LIKE ?", (f"{prefix}%",))

        conn.commit()

        if deleted_skus:
            message = f'Estoque atualizado com sucesso! Excluídos SKUs com prefixos: {", ".join(prefixes)}.'
            print(f'[Server] Atualização do estoque: Prefixos={prefixes}, SKUs excluídos={deleted_skus}')
        else:
            message = f'Nenhum SKU encontrado para os prefixos: {", ".join(prefixes)}.'
            print(f'[Server] Atualização do estoque: Nenhum SKU excluído para prefixos={prefixes}')

        return jsonify({'success': True, 'message': message})

@app.route('/change_password', methods=['GET', 'POST'])
@login_required
def change_password():
    if current_user.role != 'admin':
        flash('Acesso negado: Somente administradores podem alterar senhas.', 'error')
        print(f'[Server] Acesso negado para {current_user.username} em change_password')
        return redirect(url_for('index'))

    if request.method == 'POST':
        current_password = request.form.get('current_password')
        new_password = request.form.get('new_password')
        confirm_password = request.form.get('confirm_password')

        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT password_hash FROM users WHERE id = ?", (current_user.id,))
            user = cursor.fetchone()
            if not check_password_hash(user['password_hash'], current_password):
                flash('Senha atual incorreta.', 'error')
                return redirect(url_for('change_password'))

            if new_password != confirm_password:
                flash('As novas senhas não coincidem.', 'error')
                return redirect(url_for('change_password'))

            if len(new_password) < 6:
                flash('A nova senha deve ter pelo menos 6 caracteres.', 'error')
                return redirect(url_for('change_password'))

            new_password_hash = generate_password_hash(new_password)
            cursor.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_password_hash, current_user.id))
            conn.commit()
            flash('Senha alterada com sucesso!', 'info')
            return redirect(url_for('index'))

    return render_template('change_password.html')

@app.route('/import_planilha', methods=['GET', 'POST'])
@login_required
def import_planilha():
    if current_user.role != 'admin':
        flash('Acesso negado: Somente administradores podem importar planilhas.', 'error')
        print(f'[Server] Acesso negado para {current_user.username} em import_planilha')
        return redirect(url_for('index'))

    if request.method == 'POST':
        print(f'[Server] POST recebido em /import_planilha, request.files: {request.files}')
        if 'file' not in request.files:
            flash('Nenhum arquivo selecionado.', 'error')
            print('[Server] Erro: Nenhum arquivo encontrado em request.files')
            return redirect(url_for('import_planilha'))

        file = request.files['file']
        if file.filename == '':
            flash('Nenhum arquivo selecionado.', 'error')
            print('[Server] Erro: Nome do arquivo vazio')
            return redirect(url_for('import_planilha'))

        if not (file.filename.endswith('.xlsx') or file.filename.endswith('.txt')):
            flash('Por favor, envie um arquivo .xlsx ou .txt.', 'error')
            print(f'[Server] Erro: Formato de arquivo inválido - {file.filename}')
            return redirect(url_for('import_planilha'))

        skus_que_precisam_caixa_prefixos = ["PV", "PH", "FF", "FH", "RV", "PR"]
        skus_sem_caixa = ["PC", "CL", "KD", "KC", "VC", "TP"]
        valid_prefixes = skus_sem_caixa + skus_que_precisam_caixa_prefixos
        current_date = datetime.now().strftime('%d/%m/%Y')
        success_count = 0
        error_messages = []

        with get_db() as conn:
            cursor = conn.cursor()
            if file.filename.endswith('.xlsx'):
                try:
                    df = pd.read_excel(file)
                    required_columns = ['SKU', 'Quantidade', 'Caixa']
                    if not all(col in df.columns for col in required_columns):
                        flash('O arquivo .xlsx deve conter as colunas: SKU, Quantidade, Caixa.', 'error')
                        print('[Server] Erro: Colunas obrigatórias ausentes no arquivo .xlsx')
                        return redirect(url_for('import_planilha'))

                    for index, row in df.iterrows():
                        try:
                            # Handle SKU
                            sku = str(row['SKU']).strip().upper() if pd.notna(row['SKU']) else ''
                            if not sku:
                                error_messages.append(f'Linha {index + 2}: SKU vazio ou inválido.')
                                print(f'[Server] Rejeitado: SKU=vazio, Linha={index + 2}, Motivo=SKU vazio')
                                continue

                            sku_prefixo = sku[:2]
                            if sku_prefixo not in valid_prefixes:
                                error_messages.append(f'Linha {index + 2}: SKU {sku} possui prefixo inválido. Prefixos válidos: PC, CL, KD, KC, VC, TP, PV, PH, FF, FH, RV, PR.')
                                print(f'[Server] Rejeitado: SKU={sku}, Linha={index + 2}, Motivo=Prefixo inválido ({sku_prefixo})')
                                continue

                            # Handle Quantidade
                            quantity = validate_quantity(row['Quantidade'], sku, index + 2, error_messages)
                            if quantity is None:
                                continue

                            # Handle Caixa
                            caixa = str(row['Caixa']).strip().upper() if pd.notna(row['Caixa']) else 'N/A'
                            normalized_caixa = normalize_caixa(caixa)
                            if normalized_caixa is None:
                                error_messages.append(f'Linha {index + 2}: Caixa inválida para SKU {sku}. Deve ser N/A, F/C ou um número de 1 a 30.')
                                print(f'[Server] Rejeitado: SKU={sku}, Linha={index + 2}, Motivo=Caixa inválida ({caixa})')
                                continue

                            if sku_prefixo in skus_sem_caixa:
                                caixa = 'N/A'  # Forçar N/A para SKUs sem caixa
                            elif sku_prefixo in skus_que_precisam_caixa_prefixos:
                                if normalized_caixa == 'N/A':
                                    error_messages.append(f'Linha {index + 2}: SKU {sku} requer uma caixa válida (F/C ou 1-30, não N/A).')
                                    print(f'[Server] Rejeitado: SKU={sku}, Linha={index + 2}, Motivo=Caixa N/A não permitida')
                                    continue
                                caixa = normalized_caixa

                            # Insert into database
                            cursor.execute("INSERT INTO transactions (sku, transaction_type, quantity, date, caixa) VALUES (?, ?, ?, ?, ?)",
                                          (sku, 'entrada', quantity, current_date, caixa))
                            cursor.execute("""
                                INSERT INTO estoque (codigo, quantidade, caixa) 
                                VALUES (?, ?, ?) 
                                ON CONFLICT(codigo) DO UPDATE SET quantidade = quantidade + ?, caixa = ?
                            """, (sku, quantity, caixa, quantity, caixa))
                            conn.commit()
                            success_count += 1
                            print(f'[Server] Importado: SKU={sku}, Quantidade={quantity}, Caixa={caixa}')
                        except Exception as e:
                            error_messages.append(f'Linha {index + 2}: Erro ao processar SKU {sku}: {str(e)}')
                            print(f'[Server] Rejeitado: SKU={sku}, Linha={index + 2}, Motivo=Erro interno: {str(e)}')
                            conn.rollback()
                            continue

                except Exception as e:
                    flash(f'Erro ao processar o arquivo .xlsx: {str(e)}', 'error')
                    print(f'[Server] Erro ao processar .xlsx: {str(e)}')
                    return redirect(url_for('import_planilha'))

            elif file.filename.endswith('.txt'):
                try:
                    content = file.read().decode('utf-8').splitlines()
                    kit_sku_quantities = {}
                    panel_rows = []

                    for index, line in enumerate(content, start=1):
                        if not line.strip():
                            continue
                        try:
                            parts = [part.strip() for part in line.split(',')]
                            if len(parts) < 2:
                                error_messages.append(f'Linha {index}: Formato inválido. Esperado: SKU,QUANTIDADE[,CAIXA].')
                                print(f'[Server] Rejeitado: Linha={index}, Motivo=Formato inválido')
                                continue

                            sku = parts[0].upper()
                            if not sku:
                                error_messages.append(f'Linha {index}: SKU vazio ou inválido.')
                                print(f'[Server] Rejeitado: SKU=vazio, Linha={index}, Motivo=SKU vazio')
                                continue

                            sku_prefixo = sku[:2]
                            if sku_prefixo not in valid_prefixes:
                                error_messages.append(f'Linha {index}: SKU {sku} possui prefixo inválido. Prefixos válidos: PC, CL, KD, KC, VC, TP, PV, PH, FF, FH, RV, PR.')
                                print(f'[Server] Rejeitado: SKU={sku}, Linha={index}, Motivo=Prefixo inválido ({sku_prefixo})')
                                continue

                            quantity = validate_quantity(parts[1], sku, index, error_messages)
                            if quantity is None:
                                continue

                            caixa = parts[2].upper() if len(parts) >= 3 else 'N/A'
                            normalized_caixa = normalize_caixa(caixa)
                            if normalized_caixa is None:
                                error_messages.append(f'Linha {index}: Caixa inválida para SKU {sku}. Deve ser N/A, F/C ou um número de 1 a 30.')
                                print(f'[Server] Rejeitado: SKU={sku}, Linha={index}, Motivo=Caixa inválida ({caixa})')
                                continue

                            if sku_prefixo in skus_sem_caixa:
                                caixa = 'N/A'  # Forçar N/A para SKUs sem caixa
                                kit_sku_quantities[sku] = kit_sku_quantities.get(sku, 0) + quantity
                            elif sku_prefixo in skus_que_precisam_caixa_prefixos:
                                if normalized_caixa == 'N/A':
                                    error_messages.append(f'Linha {index}: SKU {sku} requer uma caixa válida (F/C ou 1-30, não N/A).')
                                    print(f'[Server] Rejeitado: SKU={sku}, Linha={index}, Motivo=Caixa N/A não permitida')
                                    continue
                                caixa = normalized_caixa
                                panel_rows.append((index, sku, quantity, caixa))

                        except Exception as e:
                            error_messages.append(f'Linha {index}: Erro ao processar linha: {str(e)}')
                            print(f'[Server] Rejeitado: SKU={sku or "desconhecido"}, Linha={index}, Motivo=Erro interno: {str(e)}')
                            continue

                    # Processar SKUs sem caixa (kits e TP)
                    for sku, quantity in kit_sku_quantities.items():
                        try:
                            cursor.execute("INSERT INTO transactions (sku, transaction_type, quantity, date, caixa) VALUES (?, ?, ?, ?, ?)",
                                          (sku, 'entrada', quantity, current_date, 'N/A'))
                            cursor.execute("""
                                INSERT INTO estoque (codigo, quantidade, caixa) 
                                VALUES (?, ?, ?) 
                                ON CONFLICT(codigo) DO UPDATE SET quantidade = quantidade + ?, caixa = ?
                            """, (sku, quantity, 'N/A', quantity, 'N/A'))
                            conn.commit()
                            success_count += 1
                            print(f'[Server] Importado: SKU={sku}, Quantidade={quantity}, Caixa=N/A')
                        except Exception as e:
                            error_messages.append(f'Erro ao processar SKU {sku} (kits/TP): {str(e)}')
                            print(f'[Server] Rejeitado: SKU={sku}, Motivo=Erro interno: {str(e)}')
                            conn.rollback()
                            continue

                    # Processar SKUs com caixa (painéis)
                    for index, sku, quantity, caixa in panel_rows:
                        try:
                            cursor.execute("INSERT INTO transactions (sku, transaction_type, quantity, date, caixa) VALUES (?, ?, ?, ?, ?)",
                                          (sku, 'entrada', quantity, current_date, caixa))
                            cursor.execute("""
                                INSERT INTO estoque (codigo, quantidade, caixa) 
                                VALUES (?, ?, ?) 
                                ON CONFLICT(codigo) DO UPDATE SET quantidade = quantidade + ?, caixa = ?
                            """, (sku, quantity, caixa, quantity, caixa))
                            conn.commit()
                            success_count += 1
                            print(f'[Server] Importado: SKU={sku}, Quantidade={quantity}, Caixa={caixa}')
                        except Exception as e:
                            error_messages.append(f'Linha {index}: Erro ao processar SKU {sku}: {str(e)}')
                            print(f'[Server] Rejeitado: SKU={sku}, Linha={index}, Motivo=Erro interno: {str(e)}')
                            conn.rollback()
                            continue

                except Exception as e:
                    flash(f'Erro ao processar o arquivo .txt: {str(e)}', 'error')
                    print(f'[Server] Erro ao processar .txt: {str(e)}')
                    return redirect(url_for('import_planilha'))

        for error in error_messages:
            flash(error, 'error')
        if success_count > 0:
            flash(f'{success_count} SKU(s) importado(s) com sucesso!', 'info')
        elif not error_messages:
            flash('Nenhum SKU foi importado. Verifique o formato do arquivo.', 'error')

        print(f'[Server] Importação concluída: {success_count} SKUs importados, {len(error_messages)} erros')
        return redirect(url_for('index'))

    return render_template('import_planilha.html')

@app.route('/download_pdf')
@login_required
def download_pdf():
    if current_user.role != 'admin':
        flash('Acesso negado: somente administradores podem baixar o estoque em PDF.', 'error')
        print(f'[Server] Acesso negado para {current_user.username} em download_pdf')
        return redirect(url_for('index'))

    items = get_items()
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    left_margin = 30
    right_margin = 30
    top_margin = 30
    bottom_margin = 30

    total_usable_width = width - left_margin - right_margin
    table_width = total_usable_width * 0.8
    col_widths = [table_width * 0.4, table_width * 0.3, table_width * 0.3]

    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(width / 2, height - top_margin - 20, "Relatório de Estoque")

    c.setFont("Helvetica-Bold", 12)
    headers = ["SKU", "Quantidade", "Caixa"]
    y_position = height - top_margin - 50
    c.drawString(left_margin, y_position, headers[0])
    c.drawString(left_margin + col_widths[0], y_position, headers[1])
    c.drawString(left_margin + col_widths[0] + col_widths[1], y_position, headers[2])
    y_position -= 15
    c.line(left_margin, y_position, left_margin + table_width, y_position)
    y_position -= 10

    c.setFont("Helvetica", 10)
    skus_que_precisam_caixa_prefixos = ["PV", "PH", "FF", "FH", "RV", "PR"]
    for item in items:
        sku = item['codigo']
        quantity = item['quantidade']
        caixa = item['caixa'] if item['caixa'] else "N/A"
        c.drawString(left_margin, y_position, sku)
        c.drawString(left_margin + col_widths[0], y_position, str(quantity))
        c.drawString(left_margin + col_widths[0] + col_widths[1], y_position, caixa)
        y_position -= 15
        if y_position < bottom_margin + 50:
            c.showPage()
            c.setFont("Helvetica", 10)
            y_position = height - top_margin

    total_items = sum(item['quantidade'] for item in items)
    y_position -= 20
    c.setFont("Helvetica-Bold", 12)
    c.drawString(left_margin, y_position, f"Total de Itens: {total_items}")

    c.setFont("Helvetica", 8)
    c.drawCentredString(width / 2, bottom_margin, "ViaCores ERP - Versão 3.2 | Desenvolvido por ViaCores")

    c.showPage()
    c.save()

    buffer.seek(0)
    return send_file(buffer, as_attachment=True, download_name='relatorio_estoque.pdf', mimetype='application/pdf')

@app.route('/edit_item', methods=['POST'])
@login_required
def edit_item():
    barcode = request.form.get('barcode')
    nova_quantidade = int(request.form.get('quantity'))
    nova_caixa = request.form.get('caixa') or None

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT quantidade, caixa FROM estoque WHERE codigo = ?", (barcode,))
        item = cursor.fetchone()  # Fixed line

        if not item:
            return jsonify({'success': False, 'error': 'Item não encontrado'})

        quantidade_antiga = item['quantidade']
        caixa_antiga = item['caixa']
        data = datetime.now().strftime('%d/%m/%Y')

        cursor.execute("""
            UPDATE estoque SET quantidade = ?, caixa = ? WHERE codigo = ?
        """, (nova_quantidade, nova_caixa, barcode))

        if nova_quantidade != quantidade_antiga:
            tipo = 'entrada' if nova_quantidade > quantidade_antiga else 'saida'
            diferenca = abs(nova_quantidade - quantidade_antiga)

            cursor.execute("""
                INSERT INTO transactions (sku, transaction_type, quantity, date, caixa)
                VALUES (?, ?, ?, ?, ?)
            """, (barcode, tipo, diferenca, data, nova_caixa))

        elif nova_caixa != caixa_antiga:
            cursor.execute("""
                INSERT INTO transactions (sku, transaction_type, quantity, date, caixa)
                VALUES (?, ?, ?, ?, ?)
            """, (barcode, 'transferencia', 0, data, nova_caixa))

        conn.commit()

    return jsonify({'success': True, 'message': 'Item atualizado com sucesso'})

@app.route('/get_skus_without_caixa', methods=['GET'])
@login_required
def get_skus_without_caixa():
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT codigo, quantidade, caixa FROM estoque WHERE caixa IS NULL OR caixa = "" OR caixa = "N/A"')
            skus = [{'codigo': row['codigo'], 'quantidade': row['quantidade'], 'caixa': row['caixa'] or 'N/A'} 
                    for row in cursor.fetchall()]
            print(f'[Server] SKUs sem caixa encontrados: {len(skus)} para usuário {current_user.username}')
            return jsonify({'success': True, 'skus': skus})
    except Exception as e:
        print(f'[Server] Erro ao buscar SKUs sem caixa para usuário {current_user.username}: {str(e)}')
        return jsonify({'success': False, 'error': f'Erro ao buscar SKUs sem caixa: {str(e)}'}), 500

@app.route('/edit_skus_without_caixa', methods=['GET'])
@login_required
def edit_skus_without_caixa():
    if current_user.role != 'admin':
        flash('Acesso não autorizado. Apenas administradores podem editar itens.', 'error')
        return redirect(url_for('index'))

    with get_db() as conn:
        cursor = conn.cursor()

        try:
            cursor.execute('SELECT codigo, quantidade, caixa FROM estoque WHERE caixa IS NULL OR caixa = "" OR caixa = "N/A"')
            items = [{'codigo': row['codigo'], 'quantidade': row['quantidade'], 'caixa': row['caixa'] or 'N/A'} 
                     for row in cursor.fetchall()]
            return render_template('edit_skus_without_caixa.html', items=items)
        except Exception as e:
            flash(f'Erro ao carregar SKUs sem caixa: {str(e)}', 'error')
            return redirect(url_for('index'))

@app.route('/update_skus_without_caixa', methods=['POST'])
@login_required
def update_skus_without_caixa():
    if current_user.role != 'admin':
        print(f'[Server] Acesso negado para {current_user.username} em update_skus_without_caixa')
        return jsonify({'success': False, 'message': 'Acesso negado: Somente administradores podem atualizar SKUs.'}), 403

    updates = request.json.get('updates', [])
    if not updates:
        return jsonify({'success': False, 'message': 'Nenhum dado de atualização fornecido.'}), 400

    skus_que_precisam_caixa_prefixos = ["PV", "PH", "FF", "FH", "RV", "PR"]
    current_date = datetime.now().strftime('%d/%m/%Y')
    success_count = 0
    error_messages = []

    with get_db() as conn:
        cursor = conn.cursor()
        for update in updates:
            sku = update.get('sku', '').strip().upper()
            try:
                quantity = int(update.get('quantity', 0))
                caixa = update.get('caixa', '').strip().upper()
            except (ValueError, TypeError):
                error_messages.append(f'SKU {sku}: Quantidade inválida.')
                print(f'[Server] Rejeitado: SKU={sku}, Motivo=Quantidade inválida')
                continue

            if not sku or quantity < 0:
                error_messages.append(f'SKU {sku}: SKU ou quantidade inválida.')
                print(f'[Server] Rejeitado: SKU={sku}, Motivo=SKU ou quantidade inválida')
                continue

            sku_prefixo = sku[:2]
            normalized_caixa = normalize_caixa(caixa)
            if sku_prefixo in skus_que_precisam_caixa_prefixos:
                if normalized_caixa is None or normalized_caixa == '':
                    error_messages.append(f'SKU {sku}: Caixa inválida. Deve ser um número de 1 a 30 ou F/C.')
                    print(f'[Server] Rejeitado: SKU={sku}, Motivo=Caixa inválida ({caixa})')
                    continue
                caixa = normalized_caixa
            else:
                caixa = 'N/A'
	
            try:
                cursor.execute("SELECT quantidade, caixa FROM estoque WHERE codigo = ?", (sku,))
                item = cursor.fetchone()
                if not item:
                    error_messages.append(f'SKU {sku}: Não encontrado no estoque.')
                    print(f'[Server] Rejeitado: SKU={sku}, Motivo=Não encontrado no estoque')
                    continue

                cursor.execute("UPDATE estoque SET quantidade = ?, caixa = ? WHERE codigo = ?",
                              (quantity, caixa or None, sku))
                if cursor.rowcount > 0:
                    cursor.execute("INSERT INTO transactions (sku, transaction_type, quantity, date, caixa) VALUES (?, ?, ?, ?, ?)",
                                  (sku, 'edit', quantity - item['quantidade'], current_date, caixa or 'N/A'))
                    success_count += 1
                    print(f'[Server] Atualizado: SKU={sku}, Quantidade={quantity}, Caixa={caixa}')
                else:
                    error_messages.append(f'SKU {sku}: Falha ao atualizar o estoque.')
                    print(f'[Server] Rejeitado: SKU={sku}, Motivo=Falha ao atualizar estoque')

                if quantity == 0:
                    cursor.execute("DELETE FROM estoque WHERE codigo = ?", (sku,))
                    print(f'[Server] Removido: SKU={sku}, Motivo=Quantidade zerada')

            except Exception as e:
                error_messages.append(f'SKU {sku}: Erro ao atualizar: {str(e)}')
                print(f'[Server] Rejeitado: SKU={sku}, Motivo=Erro interno: {str(e)}')
                conn.rollback()
                continue

        conn.commit()

    response = {
        'success': success_count > 0,
        'message': f'{success_count} SKU(s) atualizado(s) com sucesso!' if success_count > 0 else 'Nenhum SKU foi atualizado.',
        'errors': error_messages
    }
    print(f'[Server] Atualização em massa concluída: {success_count} SKUs atualizados, {len(error_messages)} erros')
    return jsonify(response)


@app.route('/open_temp_folder', methods=['POST'])
@login_required
def open_temp_folder():
    if current_user.role != 'impressao':
        logger.warning(f"Acesso negado para {current_user.username} (role: {current_user.role}) em open_temp_folder")
        return jsonify({'success': False, 'message': 'Acesso negado: Somente usuários de impressão podem abrir pastas temporárias.'}), 403

    skus_param = request.form.get('skus', '').strip()
    logger.debug(f"SKUs recebidos: {skus_param} para {current_user.username}")

    if not skus_param:
        logger.warning(f"Nenhum SKU fornecido por {current_user.username}")
        return jsonify({'success': False, 'message': 'Nenhum SKU válido fornecido.', 'not_found_skus': []}), 400

    try:
        # Monta o mapa de SKUs e quantidades
        sku_count_map = {}
        for entry in skus_param.split(','):
            if ':' in entry:
                sku, count = entry.split(':')
                sku, count = sku.strip().upper(), int(count)
                # Normaliza hífen para sublinhado em SKUs de painéis
                sku = sku.replace('-', '_')
                if count > 0:
                    sku_count_map[sku] = count
            else:
                sku = entry.strip().upper()
                # Normaliza hífen para sublinhado em SKUs de painéis
                sku = sku.replace('-', '_')
                if sku:
                    sku_count_map[sku] = 1
        logger.debug(f"Mapa de SKUs: {sku_count_map} para {current_user.username}")

        if not sku_count_map:
            logger.warning(f"Nenhum SKU válido após processamento para {current_user.username}")
            return jsonify({'success': False, 'message': 'Nenhum SKU válido fornecido.', 'not_found_skus': []}), 400

        # Cria a pasta temporária
        temp_dir_name = f"temp_{int(time.time())}_{random.randint(1000, 9999)}"
        shared_dir = current_app.config.get('SHARED_DIR', r'C:\Users\Via Cores - ADM\Documents\Temp')
        temp_folder = os.path.normpath(os.path.join(shared_dir, temp_dir_name))
        os.makedirs(temp_folder, exist_ok=True)
        logger.info(f"Pasta temporária criada: {temp_folder} para {current_user.username}")

        found_skus = set()
        not_found_skus = set(sku_count_map.keys())
        images_by_sku = {sku: [] for sku in sku_count_map}

        # Prefixos para kits e painéis
        kit_prefixes = ["PC", "CL", "KD", "KC", "VC"]
        panel_prefixes = ["PV", "PH", "FF", "FH", "RV", "PR"]

        # Busca imagens em IMAGE_DIR e subpastas
        all_files = []
        image_dir = current_app.config.get('IMAGE_DIR', r'C:\Users\Via Cores - ADM\Documents\Impressao')
        logger.debug(f"Iniciando varredura em {image_dir}")
        try:
            for root, dirs, files in os.walk(image_dir, topdown=True):
                logger.debug(f"Varredura no diretório: {root}")
                for file in files:
                    if file.lower().endswith(('.jpg', '.jpeg', '.png', '.gif')):
                        full_path = os.path.normpath(os.path.join(root, file))
                        all_files.append(full_path)
                        logger.debug(f"Arquivo encontrado: {full_path}")
        except Exception as e:
            logger.error(f"Erro ao varrer {image_dir}: {str(e)}")
            return jsonify({'success': False, 'message': f'Erro ao acessar diretório de imagens: {str(e)}', 'not_found_skus': []}), 500

        logger.info(f"Total de arquivos encontrados em {image_dir} e subpastas: {len(all_files)}")

        # Associa imagens aos SKUs
        for filepath in all_files:
            filename = os.path.splitext(os.path.basename(filepath))[0]
            # Extrai o SKU completo, incluindo _100 ou _999, até espaço
            sku_match = re.match(r'^([^ ]+)', filename, re.IGNORECASE)
            file_sku = sku_match.group(1).upper().replace('-', '_') if sku_match else filename.upper().replace('-', '_')
            logger.debug(f"Processando arquivo: {filepath}, SKU extraído: {file_sku}")

            for sku in sku_count_map:
                is_kit = any(sku.startswith(prefix) for prefix in kit_prefixes)
                is_panel = any(sku.startswith(prefix) for prefix in panel_prefixes) or len(sku) >= 5
                
                if is_kit:
                    # Busca por prefixo para kits
                    if filename.upper().startswith(sku):
                        images_by_sku[sku].append(filepath)
                        found_skus.add(sku)
                        not_found_skus.discard(sku)
                        logger.debug(f"Imagem de kit encontrada: {filepath} para SKU {sku}")
                elif is_panel and file_sku == sku:
                    # Busca exata para painéis, incluindo _100 e _999
                    images_by_sku[sku].append(filepath)
                    found_skus.add(sku)
                    not_found_skus.discard(sku)
                    logger.debug(f"Imagem exata encontrada: {filepath} para SKU {sku}")
                elif not (is_kit or is_panel) and sku in file_sku:
                    # Busca ampla apenas para termos genéricos (não painéis nem kits)
                    images_by_sku[sku].append(filepath)
                    found_skus.add(sku)
                    not_found_skus.discard(sku)
                    logger.debug(f"Imagem por busca ampla encontrada: {filepath} para termo {sku}")

        # Copia as imagens
        copied_files = 0
        for sku, count in sku_count_map.items():
            image_list = images_by_sku.get(sku, [])
            if not image_list:
                logger.warning(f"Nenhuma imagem encontrada para SKU {sku} em {image_dir}")
                continue
            for i in range(count):
                for img_path in image_list:
                    filename = os.path.basename(img_path)
                    name, ext = os.path.splitext(filename)
                    dest_filename = f"{name}_{i}{ext}" if i > 0 else filename
                    dest_path = os.path.normpath(os.path.join(temp_folder, dest_filename))
                    try:
                        shutil.copy2(img_path, dest_path)
                        copied_files += 1
                        logger.debug(f"Imagem copiada: {img_path} -> {dest_path}")
                    except Exception as e:
                        logger.error(f"Erro ao copiar imagem {img_path} para {dest_path}: {str(e)}")

        if not found_skus:
            shutil.rmtree(temp_folder, ignore_errors=True)
            logger.info(f"Nenhuma imagem encontrada para os SKUs: {list(not_found_skus)}")
            return jsonify({'success': False, 'message': 'Nenhuma imagem encontrada.', 'not_found_skus': list(not_found_skus)}), 400

        # Inicia exclusão automática
        threading.Thread(target=try_delete_temp_folder, args=(temp_folder,), daemon=True).start()

        logger.info(f"Pasta temporária criada: {temp_folder} com {copied_files} imagens para {current_user.username}")
        response = jsonify({
            'success': True,
            'message': 'Imagens processadas com sucesso.',
            'temp_dir': temp_folder,
            'not_found_skus': list(not_found_skus)
        })
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        return response

    except Exception as e:
        logger.error(f"Erro ao processar pasta temporária para {current_user.username}: {str(e)}")
        return jsonify({'success': False, 'message': f"Erro ao processar: {str(e)}", 'not_found_skus': []}), 500 
    
# ... (o restante do código permanece idêntico ao fornecido anteriormente, com valid_caixas e normalize_caixa já modificados)
@app.route('/cleanup_temp', methods=['POST'])
@login_required
def cleanup_temp():
    if current_user.role not in ['admin', 'impressao']:
        logger.warning(f"Acesso negado para {current_user.username} em cleanup_temp")
        return jsonify({'success': False, 'message': 'Acesso negado: Somente administradores e usuários de impressão podem excluir pastas temporárias.'}), 403

    try:
        data = request.get_json(force_empty=True) or {}
        temp_dir = data.get('temp_dir', '').strip()
        logger.debug(f"Solicitação para excluir pasta temporária: {temp_dir}")

        if not temp_dir or not os.path.exists(temp_dir) or not temp_dir.startswith(SHARED_DIR):
            logger.warning(f"Pasta temporária inválida ou não encontrada: {temp_dir}")
            return jsonify({"success": False, "message": "Pasta temporária inválida ou não encontrada."}), 404

        shutil.rmtree(temp_dir, ignore_errors=True)
        logger.info(f"Pasta temporária {temp_dir} excluída com sucesso.")
        return jsonify({"success": True, "message": "Pasta temporária excluída com sucesso."})

    except Exception as e:
        logger.error(f"Erro ao excluir pasta temporária: {str(e)}")
        return jsonify({"success": False, "message": f"Erro ao excluir pasta temporária: {str(e)}"}), 500
    
        
@app.route('/change_image_folder', methods=['POST'])
@login_required
def change_image_folder():
    if current_user.role not in ['admin', 'impressao']:
        logger.warning(f"Acesso negado para {current_user.username} em change_image_folder")
        return jsonify({'success': False, 'message': 'Acesso negado: Somente administradores e usuários de impressão podem alterar a pasta de imagens.'}), 403

    image_folder = request.form.get('image_folder', '').strip()
    logger.debug(f"Tentativa de alterar IMAGE_DIR para: {image_folder}")

    if not image_folder or not os.path.isdir(image_folder):
        logger.warning(f"Caminho inválido fornecido: {image_folder}")
        return jsonify({'success': False, 'message': 'Caminho inválido ou pasta não encontrada.'}), 400

    try:
        global IMAGE_DIR
        IMAGE_DIR = image_folder
        with open(CONFIG_FILE, 'w') as f:
            json.dump({'IMAGE_DIR': IMAGE_DIR}, f)
        logger.info(f"IMAGE_DIR alterado para: {IMAGE_DIR}")
        return jsonify({'success': True, 'message': 'Pasta de imagens alterada com sucesso.'})
    except Exception as e:
        logger.error(f"Erro ao alterar pasta de imagens: {str(e)}")
        return jsonify({'success': False, 'message': f'Erro ao alterar pasta: {str(e)}'}), 500

def cleanup_old_temp_folders():
    try:
        for folder in glob.glob(os.path.join(SHARED_DIR, "temp_*")):
            if os.path.isdir(folder):
                creation_time = os.path.getctime(folder)
                if time.time() - creation_time > 60:  # 1 minuto
                    try:
                        shutil.rmtree(folder, ignore_errors=True)
                        logger.info(f"Excluída pasta temporária antiga: {folder}")
                    except Exception as e:
                        logger.warning(f"Não foi possível excluir {folder}: {str(e)}")
    except Exception as e:
        logger.error(f"Erro ao limpar pastas temporárias antigas: {str(e)}")

def ensure_shared_dir():
    try:
        os.makedirs(IMAGE_DIR, exist_ok=True)
        os.makedirs(SHARED_DIR, exist_ok=True)
        logger.info(f"Diretórios criados: {IMAGE_DIR}, {SHARED_DIR}")

        for directory in [IMAGE_DIR, SHARED_DIR]:
            subprocess.run(
                f'icacls "{directory}" /grant Todos:(OI)(CI)F /T',
                shell=True,
                check=True,
                capture_output=True
            )
            logger.info(f"Permissões ajustadas para {directory}.")

        try:
            subprocess.run(
                f'net share {SHARE_NAME}="{SHARED_DIR}" /grant:Todos,FULL',
                shell=True,
                check=True,
                capture_output=True
            )
            logger.info(f"Compartilhamento {SHARE_NAME} criado ou já existe.")
        except subprocess.CalledProcessError as e:
            logger.warning(f"Não foi possível configurar o compartilhamento {SHARE_NAME}. Configure manualmente: {e}")
    except Exception as e:
        logger.error(f"Erro ao configurar diretórios: {str(e)}")
        
        # Iniciar limpeza periódica
def start_cleanup_thread():
    while True:
        cleanup_old_temp_folders()
        time.sleep(120)  # Verifica a cada 2 minutos    

if __name__ == '__main__':
    # Configuração para abrir o navegador automaticamente
    def open_browser():
        webbrowser.open_new('http://127.0.0.1:5000/')

    # Iniciar o servidor Flask
    try:
        print("[Server] Iniciando servidor Flask...")
        threading.Timer(1, open_browser).start()
        app.run(host='0.0.0.0', port=5000, debug=False)
    except Exception as e:
        print(f"[Server] Erro ao iniciar o servidor: {str(e)}")       
