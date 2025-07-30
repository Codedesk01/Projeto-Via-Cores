import math
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
from io import BytesIO
from functools import wraps
from bs4 import BeautifulSoup
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
from datetime import datetime, timedelta, timezone
from PIL import Image
from collections import defaultdict


app = Flask(__name__, template_folder='templates')
app.secret_key = 'ViaCores'

# Configura logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

DATABASE = 'estoque.db'
PEDIDOS_SHP_DB = 'pedidos_shp.db'
PRODUCAO_ML_DB = 'producao_ml.db'
SHOPEE_DB_PATH = "producao_shp.db"
UPLOAD_FOLDER = os.path.join('static', 'Uploads')
APR_IMAGE_DIR = r"\\Vcadms-02\vendas\PROJECOES"  # New directory for consulta images

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
CONFIG_FILE = 'config.json'

# Configurações
IMAGE_DIR = r"G:\IMPRESSAO - VIA CORES"
SHARED_DIR = r"G:\ARQUIVOS DE IMPRESSÃO TEMP"
SHARE_NAME = "TEMP"
SERVER_NAME = "Via_Cores"

# Carregar configuração inicial
def load_config():
    global IMAGE_DIR
    try:
        with open(CONFIG_FILE, 'r') as f:
            config = json.load(f)
            IMAGE_DIR = config.get('IMAGE_DIR', r"G:\IMPRESSAO - VIA CORES")
    except FileNotFoundError:
        config = {'IMAGE_DIR': IMAGE_DIR}
        with open(CONFIG_FILE, 'w') as f:
            json.dump(config, f)
load_config()

def try_delete_temp_folder(temp_dir, max_attempts=60000, delay=60000):
    logger.debug(f"Iniciando exclusão automática para {temp_dir}")
    for attempt in range(max_attempts):
        time.sleep(delay)
        try:
            if not os.path.exists(temp_dir):
                logger.info(f"Pasta {temp_dir} já foi excluída.")
                return
            temp_test = temp_dir + "_test"
            os.rename(temp_dir, temp_test)
            os.rename(temp_test, temp_dir)
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
        os.makedirs(APR_IMAGE_DIR, exist_ok=True)  # Ensure APR directory exists
        logger.info(f"Diretórios criados: {IMAGE_DIR}, {SHARED_DIR}, {APR_IMAGE_DIR}")

        for directory in [IMAGE_DIR, SHARED_DIR, APR_IMAGE_DIR]:
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
    """Exclui pastas temporárias com mais de 8 Horas."""
    try:
        for folder in glob.glob(os.path.join(SHARED_DIR, "temp_*")):
            if os.path.isdir(folder):
                creation_time = os.path.getctime(folder)
                if time.time() - creation_time > 60000:  # 360 minutos
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

class User(UserMixin):
    def __init__(self, id, username, role):
        self.id = id
        self.username = username
        self.role = role

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
    
    
    """PEDIDOS MERCADO"""
def get_pedidos_ml_db():
    conn = sqlite3.connect('pedidos_ml.db')
    cursor = conn.cursor()
    
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='pedidos'")
    if not cursor.fetchone():
        try:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS pedidos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    order_id TEXT NOT NULL,
                    date_created TEXT NOT NULL,
                    date_shipped TEXT,
                    buyer_name TEXT NOT NULL,
                    sku TEXT,
                    quantity INTEGER NOT NULL,
                    status TEXT,
                    checked INTEGER DEFAULT 0,
                    checked_date TEXT,
                    notes TEXT,
                    producao TEXT,
                    impressora TEXT,  -- New column
                    UNIQUE(order_id, sku)
                )
            """)
            conn.commit()
            print("[Server] Tabela 'pedidos' criada com sucesso")
        except sqlite3.Error as e:
            print(f'[Server] Erro ao criar tabela: {str(e)}')
            raise

    cursor.execute("PRAGMA table_info(pedidos)")
    columns = [col[1] for col in cursor.fetchall()]
    if 'impressora' not in columns:
        try:
            cursor.execute("ALTER TABLE pedidos ADD COLUMN impressora TEXT")
            conn.commit()
            print("[Server] Coluna 'impressora' adicionada à tabela pedidos")
        except sqlite3.Error as e:
            print(f'[Server] Erro ao adicionar coluna impressora: {str(e)}')

    conn.row_factory = sqlite3.Row
    return conn
    
def extract_orders_mercado(text):
    blocks = text.split("row-checkbox")
    orders = []

    for block in blocks:
        if "#200" not in block:
            continue

        order_id_match = re.search(r"#(\d{13,})", block)
        order_id = f"#{order_id_match.group(1)}" if order_id_match else None
        if not order_id:
            logger.warning(f"[Server] Bloco ignorado: Nenhum ID de pedido encontrado.")
            continue

        name_match = re.findall(r"\n([a-zA-Z0-9_.]+\s+[a-zA-Z0-9_.]+(?:\s*\(Motorista\)|\s*\(Coleta\)?)?)", block)
        customer_name = name_match[0].strip() if name_match else "Unknown"

        status = "coleta"
        notes = ""
        if re.search(r"\bCancelada\b", block, re.IGNORECASE):
            status = "cancelada"
            notes_match = re.search(r"(Cancelada[^\n]*)", block, re.IGNORECASE)
            notes = notes_match.group(1).strip() if notes_match else "Pedido cancelada"
            logger.debug(f'[Server] Pedido {order_id} identificado como Cancelada, Notes: {notes}')
        elif re.search(r"\bmotorista\b|\bmotoboy\b", block, re.IGNORECASE):
            status = "motoboy"
            notes_match = re.search(r"(Você deve dar o pacote ao seu motorista[^\n]*|Motoboy[^\n]*)", block, re.IGNORECASE)
            notes = notes_match.group(1).strip() if notes_match else "Motoboy identificado"
            logger.debug(f'[Server] Pedido {order_id} identificado como Motoboy, Notes: {notes}')
        elif "(Coleta)" in customer_name or "Pronto para coleta" in block:
            status = "coleta"
            notes = "Pronto para coleta"

        date_match = re.search(r"(\d{1,2} \w{3} \d{2}:\d{2} hs)", block)
        purchase_date = date_match.group(1) if date_match else "Not found"

        shipping_status = "Ready to ship" if any(s in block for s in ["Pronta para emitir NF-e", "Pronto para coleta", "Etiqueta pronta para imprimir"]) else "Pending"

        sku_matches = re.finditer(r"SKU:\s*([A-Z]{2}[A-Z0-9\-]+)", block)
        quantity_matches = re.finditer(r"(\d+)\s*unidade", block)
        
        skus = [match.group(1).strip() for match in sku_matches]
        quantities = [int(match.group(1)) for match in quantity_matches]

        if not skus:
            logger.warning(f"[Server] Pedido {order_id} não possui SKU válido.")
            orders.append({
                "order_id": order_id,
                "customer_name": customer_name,
                "purchase_date": purchase_date,
                "shipping_status": shipping_status,
                "sku": None,
                "quantity": 1,
                "status": status,
                "notes": notes
            })
            continue

        for i, sku in enumerate(skus):
            if sku:
                sku = re.sub(r'-(F|P|V)$', '', sku, flags=re.IGNORECASE)
                quantity = quantities[i] if i < len(quantities) else 1
                orders.append({
                    "order_id": order_id,
                    "customer_name": customer_name,
                    "purchase_date": purchase_date,
                    "shipping_status": shipping_status,
                    "sku": sku,
                    "quantity": quantity,
                    "status": status,
                    "notes": notes
                })

    return orders

"""PEDIDOS SHOPEE"""
def get_pedidos_shp_db():
    conn = sqlite3.connect('pedidos_shp.db')
    cursor = conn.cursor()
    
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='pedidos_shopee'")
    if not cursor.fetchone():
        try:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS pedidos_shopee (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    order_id TEXT NOT NULL,
                    date_created TEXT NOT NULL,
                    date_shipped TEXT,
                    buyer_name TEXT NOT NULL,
                    sku TEXT,
                    quantity INTEGER NOT NULL,
                    status TEXT,
                    checked INTEGER DEFAULT 0,
                    checked_date TEXT,
                    notes TEXT,
                    shipping_method TEXT,
                    producao TEXT,
                    impressora TEXT,  -- New column
                    UNIQUE(order_id, sku)
                )
            """)
            conn.commit()
            print("[Server] Tabela 'pedidos_shopee' criada com sucesso")
        except sqlite3.Error as e:
            print(f'[Server] Erro ao criar tabela pedidos_shopee: {str(e)}')
            raise

    cursor.execute("PRAGMA table_info(pedidos_shopee)")
    columns = [col[1] for col in cursor.fetchall()]
    if 'impressora' not in columns:
        try:
            cursor.execute("ALTER TABLE pedidos_shopee ADD COLUMN impressora TEXT")
            conn.commit()
            print("[Server] Coluna 'impressora' adicionada à tabela pedidos_shopee")
        except sqlite3.Error as e:
            print(f'[Server] Erro ao adicionar coluna impressora: {str(e)}')

    conn.row_factory = sqlite3.Row
    return conn

def extract_shopee_orders(text):
    orders = []
    lines = text.strip().splitlines()
    order = {}
    variation = None

    try:
        for line in lines:
            line = line.strip()
            if not line:
                continue
            # Ignora linhas que parecem ser códigos de rastreio (ex.: BR255518809271X)
            if re.match(r'^BR\d+[A-Z0-9]+$', line, re.IGNORECASE):
                print(f'[Server] Ignorando linha de código de rastreio: {line}')
                continue
            if line.startswith('ID do Pedido'):
                if order.get('order_id') and order.get('sku'):  # Save previous order
                    orders.append(order)
                order = {}
                order['order_id'] = line.replace('ID do Pedido ', '').strip()
                # Extrair o nome do cliente da linha anterior
                if lines.index(line) > 0:
                    prev_line = lines[lines.index(line) - 1].strip()
                    if prev_line and not prev_line.startswith('ID do Pedido') and not re.match(r'^BR\d+[A-Z0-9]+$', prev_line, re.IGNORECASE):
                        order['customer_name'] = prev_line
            elif '[' in line and ']' in line:  # SKU line, e.g., [FFDA029 FFDA029-175] or [PRCB029-F PRCB029-150 PRCB027-F PRCB027-150]
                try:
                    sku_text = line[line.find('[')+1:line.find(']')].strip()
                    skus = sku_text.split()
                    # Processa SKUs em pares, selecionando o segundo de cada par (ou o único SKU)
                    i = 0
                    while i < len(skus):
                        # Se houver pelo menos dois SKUs, pega o segundo (ex.: FFDA029-175)
                        if i + 1 < len(skus):
                            raw_sku = skus[i + 1]  # Segundo SKU do par
                            i += 2  # Pula o par
                        else:
                            raw_sku = skus[i]  # Último SKU, se for ímpar
                            i += 1
                        # Remover sufixos -F, -P, -V, -150, mas manter -130 ou -175
                        for suffix in ['-F', '-P', '-V', '-150']:
                            if raw_sku.endswith(suffix):
                                raw_sku = raw_sku[:-len(suffix)]
                        if raw_sku:  # Adiciona um novo pedido para o SKU
                            new_order = order.copy()
                            new_order['sku'] = raw_sku
                            if raw_sku.endswith('-130') and variation:
                                new_order['notes'] = variation
                            orders.append({
                                'order_id': new_order.get('order_id'),
                                'sku': new_order.get('sku'),
                                'quantity': new_order.get('quantity', 1),
                                'status': new_order.get('status', 'pending'),
                                'purchase_date': new_order.get('purchase_date', datetime.now().strftime('%d/%m/%Y %H:%M:%S')),
                                'customer_name': new_order.get('customer_name', 'Sem Nome'),
                                'notes': new_order.get('notes', ''),
                                'shipping_method': new_order.get('shipping_method', 'Coleta')
                            })
                    order['sku'] = None  # Reseta o SKU para evitar duplicatas
                except Exception as e:
                    print(f'[Server] Erro ao parsear SKU na linha "{line}": {str(e)}')
                    continue
            elif line.startswith('x'):
                try:
                    order['quantity'] = int(line.replace('x', '').strip())
                except ValueError:
                    order['quantity'] = 1
                    print(f'[Server] Quantidade inválida na linha "{line}", usando 1')
            elif line == 'A Enviar':
                order['status'] = 'pending'
            elif line.startswith('Por favor, envie o pedido antes de'):
                order['purchase_date'] = datetime.now().strftime('%d/%m/%Y %H:%M:%S')
            elif line == 'Postagem / Coleta' or line == 'Coleta':
                order['shipping_method'] = 'Coleta'

        # Save the last order if it has a SKU
        if order.get('order_id') and order.get('sku'):
            orders.append({
                'order_id': order.get('order_id'),
                'sku': order.get('sku'),
                'quantity': order.get('quantity', 1),
                'status': order.get('status', 'pending'),
                'purchase_date': order.get('purchase_date', datetime.now().strftime('%d/%m/%Y %H:%M:%S')),
                'customer_name': order.get('customer_name', 'Sem Nome'),
                'notes': order.get('notes', ''),
                'shipping_method': order.get('shipping_method', 'Coleta')
            })

    except Exception as e:
        print(f'[Server] Erro geral ao parsear pedidos Shopee: {str(e)}')
        return []

    print(f'[Server] Extraídos {len(orders)} pedidos Shopee do texto')
    return orders




"""PRODUÇÃO MERCADO LIVRE"""

def format_display_date(date_str):
    """
    Converte '10/06/2025' para 'hoje', 'Amanhã', ou '10 de junho'
    e retorna a data real como chave de ordenação (sort_key).
    """
    try:
        date_obj = datetime.strptime(date_str, '%d/%m/%Y')
        hoje = datetime.today().date()
        amanha = hoje + timedelta(days=1)

        if date_obj.date() == hoje:
            return 'hoje', date_obj
        elif date_obj.date() == amanha:
            return 'Amanhã', date_obj
        else:
            meses = [
                'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
            ]
            return f"{date_obj.day} de {meses[date_obj.month - 1]}", date_obj
    except:
        return 'hoje', datetime.today()


def get_producao_ml_db():
    conn = sqlite3.connect('producao_ml.db')
    cursor = conn.cursor()
    
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='pedidos'")
    if not cursor.fetchone():
        try:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS pedidos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    order_id TEXT NOT NULL,
                    date_created TEXT NOT NULL,
                    date_shipped TEXT,
                    sku TEXT,
                    quantity INTEGER NOT NULL,
                    status TEXT,
                    checked INTEGER DEFAULT 0,
                    checked_date TEXT,
                    producao TEXT,
                    info_data TEXT,  -- Nova coluna para dados do container
                    UNIQUE(order_id, sku)
                )
            """)
            conn.commit()
            print("[Server] Tabela 'pedidos' criada com sucesso em producao_ml.db")
        except sqlite3.Error as e:
            print(f'[Server] Erro ao criar tabela: {str(e)}')
            raise

    cursor.execute("PRAGMA table_info(pedidos)")
    columns = [col[1] for col in cursor.fetchall()]
    if 'info_data' not in columns:
        try:
            cursor.execute("ALTER TABLE pedidos ADD COLUMN info_data TEXT")
            conn.commit()
            print("[Server] Coluna 'info_data' adicionada à tabela pedidos em producao_ml.db")
        except sqlite3.Error as e:
            print(f'[Server] Erro ao adicionar coluna info_data: {str(e)}')

    conn.row_factory = sqlite3.Row
    return conn

def parse_date_or_day(date_shipped, base_date=None):
    """Parse date_shipped as a date, day name, 'Amanhã', or null, returning (sort_key, display_text)."""
    if not base_date:
        base_date = datetime.now()

    if not date_shipped or date_shipped.strip() == '':
        return (base_date, "hoje")

    if date_shipped.lower().strip() == 'amanhã':
        return (base_date + timedelta(days=1), "Amanhã")

    day_names = {
        "segunda-feira": 0, "terça-feira": 1, "quarta-feira": 2, "quinta-feira": 3,
        "sexta-feira": 4, "sábado": 5, "domingo": 6
    }

    date_shipped_lower = date_shipped.lower().strip()
    if date_shipped_lower in day_names:
        current_day = base_date.weekday()
        target_day = day_names[date_shipped_lower]
        days_ahead = (target_day - current_day + 7) % 7
        if days_ahead == 0:
            days_ahead = 7
        sort_key = base_date + timedelta(days=days_ahead)
        return (sort_key, date_shipped)

    month_names = {
        "janeiro": 1, "fevereiro": 2, "março": 3, "abril": 4, "maio": 5, "junho": 6,
        "julho": 7, "agosto": 8, "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12
    }
    if re.match(r'\d{1,2} de \w+', date_shipped, re.IGNORECASE):
        try:
            day, month = date_shipped.lower().split(' de ')
            day = int(day)
            month_num = month_names.get(month.strip())
            if month_num:
                year = base_date.year
                if month_num < base_date.month:
                    year += 1
                parsed_date = datetime(year, month_num, day)
                display_text = f"{day} de {month}"
                return (parsed_date, display_text)
        except (ValueError, KeyError):
            pass
    elif re.match(r'\d{1,2}/\d{2}/\d{4}', date_shipped):
        try:
            parsed_date = datetime.strptime(date_shipped, "%d/%m/%Y")
            display_text = f"{parsed_date.day} de {list(month_names.keys())[parsed_date.month-1]}"
            return (parsed_date, display_text)
        except ValueError:
            pass

    return (base_date, "hoje")

def extract_orders_producao(text):
    """Extract orders from input text, including order_id, sku, and date_shipped."""
    orders = []
    invalid_orders = []
    current_order = None
    sku_list = []
    date_shipped = ''
    quantity = 1
    status = 'coleta'

    blocks = text.split('row-checkbox')[1:]
    for block in blocks:
        block = block.strip()
        if not block:
            continue

        if current_order:
            if sku_list:
                for idx, sku in enumerate(sku_list, 1):
                    orders.append({
                        'order_id': current_order,
                        'sku': sku,
                        'date_shipped': date_shipped,
                        'quantity': quantity,
                        'status': status,
                        'date_created': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                        'checked': 0,
                        'producao': ''
                    })
            else:
                invalid_orders.append({
                    'order_id': current_order,
                    'error': 'SKU não identificado',
                    'status': status
                })
            sku_list = []
            date_shipped = ''
            quantity = 1
            status = 'coleta'

        order_match = re.search(r'#(\d+)', block)
        if order_match:
            current_order = order_match.group(1)
        else:
            invalid_orders.append({
                'order_id': 'N/A',
                'error': 'ID do pedido não identificado',
                'status': 'coleta'
            })
            continue

        sku_matches = re.findall(r'SKU:\s*(\S+)', block)
        for sku in sku_matches:
            clean_sku = re.sub(r'-(P|F|V)$', '', sku, flags=re.IGNORECASE)
            if clean_sku and clean_sku not in sku_list:
                sku_list.append(clean_sku)

        date_pattern = r'(?:(\d{1,2}/\d{2}/\d{4})|\b(segunda-feira|terça-feira|quarta-feira|quinta-feira|sexta-feira|sábado|domingo)\b|Para entregar na coleta de amanhã|Para entregar na coleta do dia (\d{1,2} de \w+))'
        date_match = re.search(date_pattern, block, re.IGNORECASE)
        if date_match:
            if date_match.group(0).lower().startswith('para entregar na coleta de amanhã'):
                date_shipped = 'Amanhã'
            else:
                date_shipped = date_match.group(1) or date_match.group(2) or date_match.group(3) or ''

        qty_match = re.search(r'Quantidade:\s*(\d+)|(\d+)\s*unidade', block, re.IGNORECASE)
        if qty_match:
            quantity = int(qty_match.group(1) or qty_match.group(2))

        status_match = re.search(r'Status:\s*(motoboy|motorista|cancelada|coleta)|motorista amanhã|Venda cancelada|dar o pacote ao seu motorista', block, re.IGNORECASE)
        if status_match:
            matched_status = status_match.group(1) or 'motorista' if status_match.group(0).lower() in ['motorista amanhã', 'dar o pacote ao seu motorista'] else 'cancelada' if status_match.group(0).lower() == 'venda cancelada' else None
            status = 'motoboy' if matched_status in ['motoboy', 'motorista'] else matched_status or 'coleta'

        if re.search(r'Pacote de \d+ produtos', block, re.IGNORECASE) and not sku_list:
            invalid_orders.append({
                'order_id': current_order,
                'error': 'SKU não identificado (Pacote de produtos)',
                'status': status
            })
            current_order = None

    if current_order:
        if sku_list:
            for idx, sku in enumerate(sku_list, 1):
                orders.append({
                    'order_id': current_order,
                    'sku': sku,
                    'date_shipped': date_shipped,
                    'quantity': quantity,
                    'status': status,
                    'date_created': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    'checked': 0,
                    'producao': ''
                })
        else:
            invalid_orders.append({
                'order_id': current_order,
                'error': 'SKU não identificado',
                'status': status
            })

    return orders, invalid_orders




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
        conn.execute('''
            CREATE TABLE IF NOT EXISTS pedidos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id TEXT UNIQUE NOT NULL,
                date_created TEXT NOT NULL,
                date_shipped TEXT,
                buyer_name TEXT NOT NULL,
                sku TEXT NOT NULL,
                quantity INTEGER NOT NULL
            )
        ''')
        cursor = conn.cursor()
        admin_password = generate_password_hash('admin123')
        impressao_password = generate_password_hash('imagem123')
        pedidos_password = generate_password_hash('impressao123')
        producao_password = generate_password_hash('producao123')
        cursor.execute('INSERT OR REPLACE INTO users (username, password_hash, role) VALUES (?, ?, ?)',
                       ('admin', admin_password, 'admin'))
        cursor.execute('INSERT OR REPLACE INTO users (username, password_hash, role) VALUES (?, ?, ?)',
                       ('consulta', '', 'consulta'))
        cursor.execute('INSERT OR REPLACE INTO users (username, password_hash, role) VALUES (?, ?, ?)',
                       ('conferente', '', 'conferente'))
        cursor.execute('INSERT OR REPLACE INTO users (username, password_hash, role) VALUES (?, ?, ?)',
                       ('impressao', impressao_password, 'impressao'))
        cursor.execute('INSERT OR REPLACE INTO users (username, password_hash, role) VALUES (?, ?, ?)',
                       ('pedidos', pedidos_password, 'pedidos'))
        cursor.execute('INSERT OR REPLACE INTO users (username, password_hash, role) VALUES (?, ?, ?)',
               ('user', producao_password, 'producao'))
        cursor.execute('INSERT OR REPLACE INTO users (username, password_hash, role) VALUES (?, ?, ?)',
               ('consulta_ean', '', 'conferente'))
        try:
            cursor.execute("ALTER TABLE transactions ADD COLUMN caixa TEXT")
        except sqlite3.OperationalError:
            pass
        try:
            cursor.execute("ALTER TABLE estoque ADD COLUMN reservado INTEGER DEFAULT 0")
        except sqlite3.OperationalError:
            pass
        conn.commit()
    with get_producao_ml_db() as conn:
        pass
    
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






#PRODUÇAO SHOPEE

def get_shopee_connection():
    conn = sqlite3.connect(SHOPEE_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# Cria o banco e a tabela se não existirem
def init_shopee_db():
    if not os.path.exists(SHOPEE_DB_PATH):
        print("Criando banco Shopee...")
    conn = get_shopee_connection()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS pedidos_shopee (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id TEXT,
            sku TEXT,
            status TEXT,
            checked_date TEXT,
            date_shipped TEXT,
            producao TEXT
        )
    """)
    conn.commit()
    conn.close()

init_shopee_db()







@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        redirect_url = url_for(
            'consulta' if current_user.role == 'consulta' else
            'conferente' if current_user.role == 'conferente' else
            'image_index' if current_user.role == 'impressao' else
            'pedidos' if current_user.role == 'pedidos' else
            'producao' if current_user.role == 'producao' else
            'index'  # Admin and others default to 'index'
        )
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
            
            # Handle users without password (consulta, conferente)
            if username in ['consulta', 'conferente', 'consulta_ean'] and (not user[2] or user[2] == ''):
                user_obj = User(user[0], user[1], user[3])
                login_user(user_obj)
                redirect_url = url_for(
                    'consulta' if username == 'consulta' else
                    'conferente' if username == 'conferente' else
                    'consulta_ean'  # Redireciona para a rota 'consulta_ean'
               )
                print(f'[Server] Login bem-sucedido: Usuário {username} ({user[3].capitalize()})')
                return jsonify({'success': True, 'redirect': redirect_url, 'message': f'Login bem-sucedido como {username.capitalize()}!'})
            
            # Handle users with password (admin, impressao, pedidos, producao, and alias 'user' for producao)
            if username in ['admin', 'impressao', 'pedidos', 'producao', 'user']:
                if not user[2]:
                    print(f'[Server] Login falhou: Usuário {username} não tem password_hash configurado.')
                    return jsonify({'success': False, 'message': 'Configuração de senha inválida para o usuário.'}), 401
                print(f'[Server] Verificando senha para {username}: Hash armazenado="{user[2]}"')
                if check_password_hash(user[2], password):
                    user_obj = User(user[0], user[1], user[3])
                    login_user(user_obj)
                    redirect_url = url_for(
                        'index' if username == 'admin' else
                        'image_index' if username == 'impressao' else
                        'pedidos' if username == 'pedidos' else
                        'producao'  # Redirect to 'producao' for both 'producao' and 'user'
                    )
                    print(f'[Server] Login bem-sucedido: Usuário {username} ({user[3].capitalize()}), redirecionando para {redirect_url}')
                    return jsonify({'success': True, 'redirect': redirect_url, 'message': f'Login bem-sucedido como {username.capitalize()}!'})
                else:
                    print(f'[Server] Login falhou: Senha incorreta para {username}.')
                    return jsonify({'success': False, 'message': 'Senha incorreta.'}), 401
            
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
            file_path = os.path.join(APR_IMAGE_DIR, filename)
            if os.path.exists(file_path):
                image_url = url_for('get_image_consulta', sku=sku)
                break
        sku_images.append({
            'codigo': sku,
            'quantidade': item['quantidade'],
            'caixa': item['caixa'],
            'image_url': image_url
        })

    print(f'[Server] Acesso à consulta: Usuário {current_user.username}, Itens={len(sku_images)}')
    return render_template('consulta.html', sku_images=sku_images, valid_prefixes=valid_prefixes, prefix_filter=prefix_filter, tema_filter=tema_filter)


@app.route('/get_apr_image/<sku>')
@login_required
def get_apr_image(sku):
    # Define the root directory for image search
    APR_IMAGE_DIR = r'\\Vcadms-02\vendas\PROJECOES'

    # List of suffixes to strip
    suffixes = ['-999', '-VF', '-100', '-130', '-175']
    base_sku = sku
    for suffix in suffixes:
        if sku.endswith(suffix):
            base_sku = sku[:-len(suffix)]
            print(f'[Server] SKU {sku} com sufixo {suffix} tratado como base SKU {base_sku}')
            break

    # Check if the directory is accessible
    if not os.path.exists(APR_IMAGE_DIR):
        print(f'[Server] Erro: Diretório {APR_IMAGE_DIR} não acessível para SKU={sku}')
        placeholder_path = os.path.join('static', 'img', 'placeholder.png')
        if os.path.exists(placeholder_path):
            print(f'[Server] Retornando placeholder em {placeholder_path}')
            response = make_response(send_file(placeholder_path, mimetype='image/png'))
            response.headers['Cache-Control'] = 'public, max-age=86400'
            return response
        else:
            print(f'[Server] Erro: Placeholder não encontrado em {placeholder_path}')
            return jsonify({'error': 'Imagem e placeholder não encontrados'}), 404

    # Search for image files recursively in APR_IMAGE_DIR and subfolders
    for root, _, files in os.walk(APR_IMAGE_DIR):
        for ext in ['jpg', 'jpeg', 'png', 'gif']:
            filename = f"{base_sku}.{ext}"
            if filename in files:
                file_path = os.path.join(root, filename)
                print(f'[Server] Servindo imagem APR para SKU={sku} (base SKU={base_sku}), Formato={ext}, Caminho={file_path}')
                response = make_response(send_file(file_path, mimetype=f'image/{ext}'))
                response.headers['Cache-Control'] = 'public, max-age=86400'
                return response

    # Fallback to placeholder if no image is found
    placeholder_path = os.path.join('static', 'img', 'placeholder.png')
    if os.path.exists(placeholder_path):
        print(f'[Server] Imagem APR não encontrada para SKU={sku} (base SKU={base_sku}) em {APR_IMAGE_DIR}, retornando placeholder em {placeholder_path}')
        response = make_response(send_file(placeholder_path, mimetype='image/png'))
        response.headers['Cache-Control'] = 'public, max-age=86400'
        return response
    else:
        print(f'[Server] Erro: Imagem APR e placeholder não encontrados para SKU={sku} (base SKU={base_sku}), Placeholder={placeholder_path}')
        return jsonify({'error': 'Imagem não encontrada'}), 404

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

    error_messages = []
    success_messages = []

    with get_db() as conn:
        cursor = conn.cursor()
        for index, line in enumerate(bulk_items.split('\n'), 1):
            if not line.strip():
                continue
            try:
                parts = line.split(',')
                if len(parts) < 2:
                    error_messages.append(f'Linha {index}: Formato inválido. Use: SKU,Quantidade[,Caixa].')
                    print(f'[Server] Rejeitado: Linha={index}, Motivo=Formato inválido')
                    continue

                sku = parts[0].strip().upper()
                quantity = validate_quantity(parts[1].strip(), sku, index, error_messages)
                if quantity is None:
                    continue

                caixa = 'N/A'
                if len(parts) >= 3:
                    caixa_input = parts[2].strip().upper()
                    normalized_caixa = normalize_caixa(caixa_input)
                    if normalized_caixa is None:
                        error_messages.append(f'Linha {index}: Caixa inválida para {sku}: deve ser um número de 1 a 30, N/A ou F/C.')
                        print(f'[Server] Rejeitado: SKU={sku}, Linha={index}, Motivo=Caixa inválida ({caixa_input})')
                        continue
                    caixa = normalized_caixa

                sku_prefixo = sku[:2]
                if sku_prefixo not in (skus_que_precisam_caixa_prefixos + skus_sem_caixa):
                    error_messages.append(f'Linha {index}: SKU {sku} possui prefixo inválido. Prefixos válidos: {", ".join(skus_que_precisam_caixa_prefixos + skus_sem_caixa)}.')
                    print(f'[Server] Rejeitado: SKU={sku}, Linha={index}, Motivo=Prefixo inválido ({sku_prefixo})')
                    continue

                if sku_prefixo in skus_sem_caixa:
                    caixa = 'N/A'

                caixa_to_log = caixa

                if action == 'bulk_add':
                    # Verificar se o SKU já existe e está associado a uma caixa diferente
                    cursor.execute("SELECT quantidade, caixa FROM estoque WHERE codigo = ?", (sku,))
                    item = cursor.fetchone()
                    if item:
                        current_caixa = item['caixa'] or 'N/A'
                        if sku_prefixo in skus_que_precisam_caixa_prefixos:
                            if caixa == 'N/A':
                                error_messages.append(f'Linha {index}: SKU {sku} requer uma caixa válida (1-30 ou F/C). Caixa atual: {current_caixa}.')
                                print(f'[Server] Rejeitado: SKU={sku}, Linha={index}, Motivo=Caixa N/A não permitida')
                                continue
                            if current_caixa != 'N/A' and caixa != current_caixa:
                                error_messages.append(f'Linha {index}: SKU {sku} já está associado à caixa {current_caixa}. Não é possível adicionar à caixa {caixa}.')
                                print(f'[Server] Rejeitado: SKU={sku}, Linha={index}, Motivo=Caixa mismatch (Atual={current_caixa}, Fornecida={caixa})')
                                continue
                            # Se a caixa for igual ou o SKU não tiver caixa (N/A), prosseguir com a adição
                            cursor.execute("UPDATE estoque SET quantidade = quantidade + ? WHERE codigo = ?",
                                          (quantity, sku))
                    else:
                        if sku_prefixo in skus_que_precisam_caixa_prefixos and caixa == 'N/A':
                            error_messages.append(f'Linha {index}: SKU {sku} requer uma caixa válida (1-30 ou F/C).')
                            print(f'[Server] Rejeitado: SKU={sku}, Linha={index}, Motivo=Caixa N/A não permitida para novo SKU')
                            continue
                        cursor.execute("INSERT INTO estoque (codigo, quantidade, caixa) VALUES (?, ?, ?)",
                                      (sku, quantity, caixa))

                    cursor.execute("INSERT INTO transactions (sku, transaction_type, quantity, date, caixa) VALUES (?, ?, ?, ?, ?)",
                                   (sku, 'entrada', quantity, current_date, caixa_to_log))
                    success_messages.append(f'Linha {index}: Adicionado {quantity} de {sku} na caixa {caixa}.')
                    print(f'[Server] Adição bem-sucedida: SKU={sku}, Quantidade={quantity}, Caixa={caixa}, Linha={index}')

                elif action == 'bulk_remove':
                    cursor.execute("SELECT quantidade, caixa FROM estoque WHERE codigo = ?", (sku,))
                    item = cursor.fetchone()
                    if not item:
                        error_messages.append(f'Linha {index}: SKU {sku} não encontrado no estoque.')
                        print(f'[Server] Rejeitado: SKU={sku}, Linha={index}, Motivo=SKU não encontrado')
                        continue
                    if item['quantidade'] < quantity:
                        error_messages.append(f'Linha {index}: Quantidade insuficiente para {sku}. Disponível: {item["quantidade"]}.')
                        print(f'[Server] Rejeitado: SKU={sku}, Linha={index}, Motivo=Quantidade insuficiente (Disponível={item["quantidade"]}, Solicitado={quantity})')
                        continue

                    current_caixa = item['caixa'] or 'N/A'
                    cursor.execute("UPDATE estoque SET quantidade = quantidade - ? WHERE codigo = ?",
                                   (quantity, sku))
                    cursor.execute("INSERT INTO transactions (sku, transaction_type, quantity, date, caixa) VALUES (?, ?, ?, ?, ?)",
                                   (sku, 'saida', quantity, current_date, current_caixa))

                    cursor.execute("SELECT quantidade FROM estoque WHERE codigo = ?", (sku,))
                    result = cursor.fetchone()
                    if result and result['quantidade'] <= 0:
                        cursor.execute("DELETE FROM estoque WHERE codigo = ?", (sku,))
                    success_messages.append(f'Linha {index}: Removido {quantity} de {sku} da caixa {current_caixa}.')
                    print(f'[Server] Remoção bem-sucedida: SKU={sku}, Quantidade={quantity}, Caixa={current_caixa}, Linha={index}')

            except Exception as e:
                error_messages.append(f'Linha {index}: Erro ao processar SKU {sku}: {str(e)}')
                print(f'[Server] Erro interno ao processar SKU={sku}, Linha={index}, Ação={action}: {str(e)}')
                continue

        try:
            conn.commit()
        except Exception as e:
            conn.rollback()
            error_messages.append(f'E   rro ao salvar no banco de dados: {str(e)}')
            print(f'[Server] Erro ao salvar no banco de dados: {str(e)}')
            return jsonify({'success': False, 'error': 'Erro ao salvar no banco de dados.'}), 500

    for msg in error_messages:
        flash(msg, 'error')
    for msg in success_messages:
        flash(msg, 'success')

    print(f'[Server] Operação em massa concluída: Ação={action}, Sucessos={len(success_messages)}, Erros={len(error_messages)}')
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


# Register date_to_sortable as a SQLite custom function
def sqlite_date_to_sortable(date_str):
    """Converte DD/MM/YYYY em YYYYMMDD para ordenação."""
    try:
        dt = datetime.strptime(date_str, '%d/%m/%Y')
        return dt.strftime('%Y%m%d')
    except ValueError:
        return date_str

# Apply the custom function to the database connection
def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    conn.create_function("date_to_sortable", 1, sqlite_date_to_sortable)
    return conn

# Modified consulta route to fetch images from APR_IMAGE_DIR

# New route to serve images from APR_IMAGE_DIR
@app.route('/get_image_consulta/<sku>')
@login_required
def get_image_consulta(sku):
    for ext in ['jpg', 'jpeg', 'png', 'gif']:
        filename = f"{sku}.{ext}"
        file_path = os.path.join(APR_IMAGE_DIR, filename)
        if os.path.exists(file_path):
            print(f'[Server] Servindo imagem para SKU={sku}, Formato={ext}, Caminho={file_path}')
            response = make_response(send_file(file_path))
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






@app.template_filter('date_to_sortable')
def date_to_sortable(date_str):
    """Converte DD/MM/YYYY em YYYYMMDD para ordenação."""
    try:
        dt = datetime.strptime(date_str, '%d/%m/%Y')
        return dt.strftime('%Y%m%d')
    except ValueError:
        return date_str


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
                    ORDER BY date_to_sortable(date)
                """, (termo, f"{termo}%", f"%{termo}%"))
                all_trans.extend(cursor.fetchall())
        else:
            cursor.execute("""
                SELECT sku, transaction_type, quantity, date, caixa
                FROM transactions
                ORDER BY sku, date_to_sortable(date)
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
                    ORDER BY sku, date_to_sortable(date)
                """, (termo, f"{termo}%", f"%{termo}%"))
                all_trans.extend(cursor.fetchall())
        else:
            cursor.execute("""
                SELECT sku, transaction_type, quantity, date, caixa
                FROM transactions
                ORDER BY sku, date_to_sortable(date)
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

    for sku, data in sorted(data_por_sku.items()):
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
        for trans in sorted(data['transactions'], key=lambda x: sqlite_date_to_sortable(x['date'])):
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
        shared_dir = current_app.config.get('SHARED_DIR', r'G:\ARQUIVOS DE IMPRESSÃO TEMP')
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
        image_dir = current_app.config.get('IMAGE_DIR', r'G:\IMPRESSAO - VIA CORES')
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
                if time.time() - creation_time > 60000:  # 360 minutos
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
        
        
      #MOTOR MERCADO LIVRE PEDIDOS  
      
@app.route('/process', methods=['POST'])
@login_required
def process_text():
    if current_user.role != 'pedidos':
        return jsonify({'success': False, 'message': 'Acesso negado: Somente usuários de pedidos podem processar.'}), 403

    data = request.get_json()
    text = data.get('text', '').strip()
    if not text:
        return jsonify({'success': False, 'message': 'Nenhum texto fornecido.'}), 400

    orders = extract_orders_mercado(text)
    valid_orders = [o for o in orders if o["sku"] and o["order_id"]]
    invalid_orders = [o for o in orders if not o["sku"] or not o["order_id"]]
    invalid_no_sku = []
    corrected_order_ids = []
    
    conn = get_pedidos_ml_db()
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(pedidos)")
        columns = [col[1] for col in cursor.fetchall()]
        notes_exists = 'notes' in columns
        notes_field = ", notes" if notes_exists else ""
        notes_placeholder = ", ?" if notes_exists else ""

        inserted_orders = []
        failed_orders = []
        previously_invalid_ids = set()
        cursor.execute("SELECT order_id FROM pedidos WHERE checked = 0")
        existing_orders = {row['order_id'] for row in cursor.fetchall()}
        for order in invalid_orders:
            if order["order_id"] in existing_orders:
                previously_invalid_ids.add(order["order_id"])

        for order in valid_orders:
            try:
                cursor.execute("SELECT id FROM pedidos WHERE order_id = ? AND sku IS NULL", (order['order_id'],))
                existing_invalid_rows = cursor.fetchall()
                if existing_invalid_rows:
                    values = [
                        order['sku'],
                        order.get('customer_name', 'Sem Nome'),
                        order.get('notes', ''),
                        'pending',
                        order['order_id']
                    ]
                    cursor.execute("""
                        UPDATE pedidos
                        SET sku = ?, buyer_name = ?, notes = ?, status = ?
                        WHERE order_id = ? AND sku IS NULL
                    """, values)
                    if order['order_id'] not in corrected_order_ids:
                        corrected_order_ids.append(order['order_id'])
                    print(f'[Server] Pedido corrigido: Order_ID={order["order_id"]}, SKU={order["sku"]}, Buyer={order.get("customer_name", "Sem Nome")}, Notes={order.get("notes", "")}, Updated Rows={len(existing_invalid_rows)}')
                    inserted_orders.append({
                        "id": None,
                        "order_id": order['order_id'],
                        "sku": order['sku'],
                        "buyer_name": order.get('customer_name', 'Sem Nome'),
                        "notes": order.get('notes', ''),
                        "quantity": order.get('quantity', 1),
                        "status": 'pending'
                    })
                    cursor.execute("DELETE FROM pedidos WHERE order_id = ? AND sku IS NULL AND id NOT IN (SELECT MIN(id) FROM pedidos WHERE order_id = ? AND sku IS NULL)", (order['order_id'], order['order_id']))
                    print(f'[Server] Removed duplicate invalid rows for Order_ID={order["order_id"]}, Rows Deleted={cursor.rowcount}')
                    continue

                cursor.execute("SELECT order_id, sku FROM pedidos WHERE order_id = ? AND sku = ?", (order['order_id'], order['sku']))
                if cursor.fetchone():
                    print(f'[Server] Pedido {order["order_id"]} com SKU {order["sku"]} já existe, ignorando.')
                    continue

                values = [
                    order['order_id'],
                    order.get('purchase_date'),
                    None,
                    order.get('customer_name', 'Sem Nome'),
                    order['sku'],
                    order.get('quantity', 1),
                    order.get('status', 'pending'),
                    0,
                    None
                ]
                if notes_exists:
                    values.append(order.get('notes', ''))

                cursor.execute(f"""
                    INSERT INTO pedidos (order_id, date_created, date_shipped, buyer_name, sku, quantity, status, checked, checked_date{notes_field})
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?{notes_placeholder})
                """, tuple(values))
                cursor.execute("SELECT last_insert_rowid()")
                order_id_db = cursor.fetchone()[0]
                print(f'[Server] Pedido inserido: ID={order_id_db}, Order_ID={order["order_id"]}, SKU={order["sku"]}, Quantidade={order["quantity"]}, Status={order["status"]}, Notes={order.get("notes", "")}')
                inserted_orders.append({**order, "id": order_id_db})
            except sqlite3.Error as e:
                print(f'[Server] Erro ao inserir pedido {order["order_id"]} com SKU {order["sku"]}: {str(e)}')
                failed_orders.append({"order_id": order["order_id"], "sku": order["sku"], "error": str(e), "notes": order.get("notes", "")})
                continue

        for order in invalid_orders:
            if not order["sku"] and order["order_id"]:
                try:
                    if order["order_id"] in corrected_order_ids:
                        print(f'[Server] Pedido {order["order_id"]} já corrigido, ignorando inserção inválida.')
                        continue
                    cursor.execute("SELECT order_id FROM pedidos WHERE order_id = ? AND sku IS NOT NULL", (order['order_id'],))
                    if cursor.fetchone():
                        print(f'[Server] Pedido {order["order_id"]} já possui SKUs válidos, ignorando inserção inválida.')
                        continue

                    cursor.execute("SELECT order_id FROM pedidos WHERE order_id = ? AND sku IS NULL", (order['order_id'],))
                    if cursor.fetchone():
                        print(f'[Server] Pedido sem SKU {order["order_id"]} já existe, ignorando.')
                        continue

                    values = [
                        order['order_id'],
                        order.get('purchase_date'),
                        None,
                        order.get('customer_name', 'Sem Nome'),
                        None,
                        order.get('quantity', 1),
                        order.get('status', 'pending'),
                        0,
                        None
                    ]
                    if notes_exists:
                        values.append(order.get('notes', ''))

                    cursor.execute(f"""
                        INSERT INTO pedidos (order_id, date_created, date_shipped, buyer_name, sku, quantity, status, checked, checked_date{notes_field})
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?{notes_placeholder})
                    """, tuple(values))
                    cursor.execute("SELECT last_insert_rowid()")
                    order_id_db = cursor.fetchone()[0]
                    print(f'[Server] Pedido sem SKU inserido: ID={order_id_db}, Order_ID={order["order_id"]}, Buyer={order.get("customer_name", "Sem Nome")}, Notes={order.get("notes", "")}')
                    invalid_no_sku.append({
                        "order_id": order["order_id"],
                        "buyer_name": order.get("customer_name", "Sem Nome"),
                        "error": "SKU não encontrado",
                        "notes": order.get("notes", "")
                    })
                except sqlite3.Error as e:
                    print(f'[Server] Erro ao inserir pedido sem SKU {order["order_id"]}: {str(e)}')
                    failed_orders.append({
                        "order_id": order["order_id"],
                        "buyer_name": order.get("customer_name", "Sem Nome"),
                        "error": str(e),
                        "notes": order.get("notes", "")
                    })
                    continue
            elif not order["order_id"]:
                invalid_no_sku.append({
                    "order_id": "N/A",
                    "buyer_name": order.get("customer_name", "Sem Nome"),
                    "error": "ID do pedido não encontrado",
                    "notes": order.get("notes", "")
                })

        conn.commit()
    finally:
        conn.close()

    success_message = "Pedidos processados com sucesso."
    if previously_invalid_ids or corrected_order_ids:
        ids = list(previously_invalid_ids) + corrected_order_ids
        success_message += " IDs processados: " + ", ".join(ids)

    print(f'[Server] Processamento concluído: {len(inserted_orders)} pedidos inseridos, {len(invalid_orders)} inválidos, {len(invalid_no_sku)} sem SKU, {len(failed_orders)} falhados, {len(corrected_order_ids)} corrigidos')
    print(f'[Server] Corrected Order IDs: {corrected_order_ids}')
    print(f'[Server] Invalid No SKU IDs: {invalid_no_sku}')
    return jsonify({
        "success": True,
        "valid_orders": inserted_orders,
        "invalid_orders": invalid_orders,
        "previously_invalid_ids": list(previously_invalid_ids),
        "corrected_order_ids": corrected_order_ids,
        "success_skus": [o["sku"] for o in inserted_orders],
        "invalid_no_sku_ids": invalid_no_sku,
        "failed_orders": failed_orders,
        "message": success_message
    })

@app.route('/get_all_orders', methods=['GET'])
@login_required
def get_all_orders():
    if current_user.role != 'pedidos':
        return jsonify({'success': False, 'message': 'Acesso negado: Somente usuários de pedidos podem visualizar pedidos.'}), 403

    conn = get_pedidos_ml_db()
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(pedidos)")
        columns = [col[1] for col in cursor.fetchall()]
        notes_exists = 'notes' in columns
        select_notes = ", notes" if notes_exists else ""

        cursor.execute(f"""
            SELECT id, order_id, date_created, date_shipped, buyer_name, sku, quantity, status, checked{select_notes}
            FROM pedidos
            ORDER BY date_created ASC
        """)
        orders = []
        invalid_no_sku_ids = []
        failed_orders = []
        valid_order_ids = set()

        for row in cursor.fetchall():
            order_data = {
                'id': row['id'],
                'order_id': row['order_id'],
                'date_created': row['date_created'],
                'date_shipped': row['date_shipped'],
                'buyer_name': row['buyer_name'],
                'sku': row['sku'],
                'quantity': row['quantity'],
                'status': row['status'],
                'checked': row['checked'],
                'notes': row['notes'] if notes_exists else ''
            }

            if row['sku']:
                valid_order_ids.add(row['order_id'])
                orders.append(order_data)
            elif row['order_id'] and row['order_id'] not in valid_order_ids:
                invalid_no_sku_ids.append({
                    'order_id': row['order_id'],
                    'buyer_name': row['buyer_name'] or 'Sem Nome',
                    'error': 'SKU não encontrado',
                    'notes': row['notes'] if notes_exists else ''
                })
            elif row['status'] == 'failed':
                failed_orders.append({
                    'order_id': row['order_id'],
                    'buyer_name': row['buyer_name'],
                    'sku': row['sku'],
                    'error': 'Processamento falhou',
                    'notes': row['notes'] if notes_exists else ''
                })

        print(f'[Server] Retornados {len(orders)} pedidos do banco, {len(invalid_no_sku_ids)} sem SKU, {len(failed_orders)} falhados')
        print(f'[Server] Valid Order IDs: {list(valid_order_ids)}')
        return jsonify({
            'success': True,
            'orders': orders,
            'invalid_no_sku_ids': invalid_no_sku_ids,
            'failed_orders': failed_orders
        })
    finally:
        conn.close()

@app.route('/delete_invalid_order', methods=['POST'])
@login_required
def delete_invalid_order():
    if current_user.role != 'pedidos':
        return jsonify({'success': False, 'message': 'Acesso negado: Somente usuários de pedidos podem deletar.'}), 403

    data = request.get_json()
    order_id = data.get('order_id')
    if not order_id or order_id == 'N/A':
        return jsonify({'success': False, 'message': 'ID do pedido inválido.'}), 400

    conn = get_pedidos_ml_db()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM pedidos WHERE order_id = ? AND sku IS NULL AND checked = 0", (order_id,))
        rows = cursor.fetchall()
        if not rows:
            print(f'[Server] Nenhum pedido inválido encontrado para Order_ID={order_id}')
            return jsonify({'success': True, 'message': 'Nenhum pedido inválido encontrado para deletar.'})

        cursor.execute("DELETE FROM pedidos WHERE order_id = ? AND sku IS NULL AND checked = 0", (order_id,))
        deleted_rows = cursor.rowcount
        conn.commit()
        print(f'[Server] Pedido inválido deletado: Order_ID={order_id}, Rows Deleted={deleted_rows}')
        return jsonify({
            'success': True,
            'message': f'Pedido inválido {order_id} deletado com sucesso.',
            'deleted_rows': deleted_rows
        })
    except sqlite3.Error as e:
        conn.rollback()
        print(f'[Server] Erro ao deletar pedido inválido {order_id}: {str(e)}')
        return jsonify({'success': False, 'message': f'Erro ao deletar pedido: {str(e)}'}), 500
    finally:
        conn.close()        
        
@app.route('/check_orders', methods=['POST'])
@login_required
def check_orders():
    if current_user.role != 'pedidos':
        return jsonify({'success': False, 'message': 'Acesso negado: Somente usuários de pedidos podem marcar pedidos.'}), 403

    data = request.get_json()
    order_ids = data.get('order_ids', [])
    producao = data.get('producao', 'Impressão').strip()
    impressora = data.get('impressora', '').strip()

    if not order_ids:
        return jsonify({'success': False, 'message': 'Nenhum ID de pedido fornecido.'}), 400

    if producao not in ['Impressão', 'Estoque']:
        return jsonify({'success': False, 'message': "Valor inválido para producao. Use 'Impressão' ou 'Estoque'."}), 400

    # Normalizar capitalização de impressora
    valid_impressoras = {
        'imp 1': 'Imp 1', 'imp1': 'Imp 1',
        'imp 2': 'Imp 2', 'imp2': 'Imp 2',
        'imp 3': 'Imp 3', 'imp3': 'Imp 3',
        'imp 4': 'Lona',  'imp4': 'Lona',
        'lona': 'Lona',
            '': ''
    }
    impressora_lower = impressora.lower()
    impressora = valid_impressoras.get(impressora_lower, impressora)  # usa original se não estiver no dicionário
    print(f'[Server] Valor de impressora recebido: "{data.get("impressora", "")}", normalizado para: "{impressora}"')

    conn = get_pedidos_ml_db()
    try:
        cursor = conn.cursor()
        checked_date = datetime.now().strftime('%d/%m/%Y %H:%M:%S')
        checked_skus = []
        errors = []

        for order_id in order_ids:
            try:
                cursor.execute("SELECT id, checked, sku, order_id, status, notes FROM pedidos WHERE id = ?", (order_id,))
                order = cursor.fetchone()
                if not order:
                    errors.append(f'Pedido ID {order_id} não encontrado.')
                    print(f'[Server] Erro: Pedido ID {order_id} não encontrado.')
                    continue
                if order['checked'] == 1:
                    errors.append(f'Pedido ID {order_id} já foi checkado.')
                    print(f'[Server] Pedido ID {order_id} já checkado, ignorando.')
                    continue

                cursor.execute(
                    "UPDATE pedidos SET checked = 1, checked_date = ?, producao = ?, impressora = ? WHERE id = ?",
                    (checked_date, producao, impressora, order_id)
                )
                print(f'[Server] Pedido checkado: ID={order_id}, SKU={order["sku"]}, Producao={producao}, Impressora={impressora} em {checked_date}')
                checked_skus.append({
                    "id": order_id,
                    "order_id": order['order_id'],
                    "sku": order['sku'],
                    "status": order['status'],
                    "notes": order['notes'] or '',
                    "checked_date": checked_date,
                    "producao": producao,
                    "impressora": impressora
                })
            except sqlite3.Error as e:
                errors.append(f'Erro ao checkar pedido ID {order_id}: {str(e)}')
                print(f'[Server] Erro ao checkar pedido ID {order_id}: {str(e)}')
                continue

        conn.commit()
        if errors:
            return jsonify({'success': False, 'message': 'Alguns pedidos não foram checkados: ' + ', '.join(errors)}), 400
        return jsonify({
            'success': True,
            'message': 'Pedidos checkados com sucesso.',
            'checked_skus': checked_skus
        })
    except sqlite3.Error as e:
        conn.rollback()
        print(f'[Server] Erro geral ao checkar pedidos: {str(e)}')
        return jsonify({'success': False, 'message': f'Erro ao checkar pedidos: {str(e)}'}), 500
    finally:
        conn.close()


        
@app.route('/checked_orders', methods=['GET'])
@login_required
def checked_orders():
    if current_user.role != 'pedidos':
        return jsonify({'success': False, 'message': 'Acesso negado: Somente usuários de pedidos podem visualizar o histórico.'}), 403

    conn = get_pedidos_ml_db()
    try:    
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, order_id, date_created, date_shipped, buyer_name, sku, quantity, status, checked_date, notes, producao, impressora
            FROM pedidos
            WHERE checked = 1
            ORDER BY checked_date DESC
        """)
        orders = [
            {
                'id': row['id'],
                'order_id': row['order_id'],
                'date_created': row['date_created'],
                'date_shipped': row['date_shipped'],
                'buyer_name': row['buyer_name'],
                'sku': row['sku'],
                'quantity': row['quantity'],
                'status': row['status'],
                'checked_date': row['checked_date'],
                'notes': row['notes'] or '',
                'producao': row['producao'] or '',
                'impressora': row['impressora'] or ''
            }
            for row in cursor.fetchall()
        ]
        print(f'[Server] Histórico de pedidos checkados retornado: {len(orders)} pedidos')
        return jsonify({'success': True, 'orders': orders})
    except sqlite3.Error as e:
        print(f'[Server] Erro ao carregar histórico: {str(e)}')
        return jsonify({'success': False, 'message': f'Erro ao carregar histórico: {str(e)}'}), 500
    finally:
        conn.close()
        
@app.route('/pedidos', methods=['GET'])
@login_required
def pedidos():
    if current_user.role != 'pedidos':
        flash('Acesso negado: Esta página é exclusiva para o usuário Pedidos.', 'error')
        print(f'[Server] Acesso negado para {current_user.username} (role={current_user.role}) em /pedidos')
        return redirect(url_for('index' if current_user.role == 'admin' else 'login'))

    # Mercado Livre orders
    conn_ml = get_pedidos_ml_db()
    try:
        cursor = conn_ml.cursor()
        cursor.execute("""
            SELECT id, order_id, date_created, date_shipped, buyer_name, sku, quantity, status, checked, notes, producao
            FROM pedidos
            ORDER BY date_created ASC
        """)
        orders = [
            {
                'id': row['id'],
                'order_id': row['order_id'],
                'date_created': row['date_created'],
                'date_shipped': row['date_shipped'],
                'buyer_name': row['buyer_name'],
                'sku': row['sku'],
                'quantity': row['quantity'],
                'status': row['status'],
                'checked': row['checked'],
                'notes': row['notes'] or '',
                'producao': row['producao'] or ''
            }
            for row in cursor.fetchall()
        ]

        sections = {
            'CL': [], 'KD': [], 'KC': [], 'VC': [], 'TP': [], 'PV': [], 'PV-ESPECIAL': [], 'PH': [],
            'FF': [], 'FH': [], 'RV': [], 'PR': [], 'PC': []
        }
        for order in orders:
            if order['sku'] and len(order['sku']) >= 2 and not order['checked']:
                if order['sku'].startswith('PV') and order['sku'].endswith(('-100', '-999', '-VF')):
                    sections['PV-ESPECIAL'].append(order['sku'])
                else:
                    prefix = order['sku'][:2]
                    if prefix in sections:
                        sections[prefix].append(order['sku'])

        for prefix in sections:
            sections[prefix].sort()

    finally:
        conn_ml.close()

    # Shopee orders
    conn_shp = get_pedidos_shp_db()
    try:
        cursor = conn_shp.cursor()
        cursor.execute("""
            SELECT id, order_id, date_created, date_shipped, buyer_name, sku, quantity, status, checked, notes, shipping_method, producao
            FROM pedidos_shopee
            ORDER BY date_created ASC
        """)
        orders_shopee = [
            {
                'id': row['id'],
                'order_id': row['order_id'],
                'date_created': row['date_created'],
                'date_shipped': row['date_shipped'],
                'buyer_name': row['buyer_name'],
                'sku': row['sku'],
                'display_sku': row['sku'],
                'quantity': row['quantity'],
                'status': row['status'],
                'checked': row['checked'],
                'notes': row['notes'] or '',
                'shipping_method': row['shipping_method'] or 'Coleta',
                'producao': row['producao'] or ''
            }
            for row in cursor.fetchall()
        ]

        # Strip -F, -P, -V, -150 from display_sku
        for order in orders_shopee:
            display_sku = order['sku']
            for suffix in ['-F', '-P', '-V', '-150']:
                if display_sku and display_sku.endswith(suffix):
                    display_sku = display_sku[:-len(suffix)]
            order['display_sku'] = display_sku or ''

        sections_shopee = {
            'CL': [], 'KD': [], 'KC': [], 'VC': [], 'TP': [], 'PV': [], 'PV-ESPECIAL': [], 'PH': [],
            'FF': [], 'FH': [], 'RV': [], 'PR': [], 'PC': []
        }
        for order in orders_shopee:
            if order['sku'] and len(order['sku']) >= 2 and not order['checked']:
                display_sku = order['display_sku']
                if display_sku.startswith('PV') and display_sku.endswith(('-100', '-999', '-VF')):
                    sections_shopee['PV-ESPECIAL'].append(display_sku)
                else:
                    prefix = display_sku[:2]
                    if prefix in sections_shopee:
                        sections_shopee[prefix].append(display_sku)

        for prefix in sections_shopee:
            sections_shopee[prefix].sort()

    except sqlite3.Error as e:
        print(f'[Server] Erro ao carregar pedidos Shopee: {str(e)}')
        orders_shopee = []
        sections_shopee = {}
    finally:
        conn_shp.close()

    # ViaCores (VC) orders
    conn_vc = sqlite3.connect(DATABASE_VC)
    try:
        cursor = conn_vc.cursor()
        cursor.execute("""
            SELECT id, order_id, sku, status, checked, producao, impressora, created_at
            FROM pedidos_vc
            ORDER BY created_at ASC
        """)
        vc_orders = [
            {
                'id': row[0],           # id
                'order_id': row[1],     # order_id
                'sku': row[2],          # sku
                'status': row[3],       # status
                'checked': row[4],      # checked
                'producao': row[5] or '',  # producao
                'impressora': row[6] or '', # impressora
                'created_at': row[7]    # created_at
            }
            for row in cursor.fetchall()
        ]

        vc_sections = agrupar_por_secao_vc(vc_orders)
        for prefix in vc_sections:
            vc_sections[prefix].sort()

    except sqlite3.Error as e:
        print(f'[Server] Erro ao carregar pedidos VC: {str(e)}')
        vc_orders = []
        vc_sections = {
            'CL': [], 'KD': [], 'KC': [], 'VC': [], 'TP': [], 'PV': [], 'PV-ESPECIAL': [], 'PH': [],
            'FF': [], 'FH': [], 'RV': [], 'PR': [], 'PC': []
        }
    finally:
        conn_vc.close()

    print(f'[Server] Acesso à página de pedidos: Usuário {current_user.username}, Pedidos ML={len(orders)}, Pedidos Shopee={len(orders_shopee)}, Pedidos VC={len(vc_orders)}')
    return render_template('pedidos.html', sections=sections, orders=orders, sections_shopee=sections_shopee, orders_shopee=orders_shopee, vc_sections=vc_sections, vc_orders=vc_orders)










"""MOTOR SHOPEE"""
@app.route('/process_shopee', methods=['POST'])
@login_required
def process_shopee():
    if current_user.role != 'pedidos':
        return jsonify({'success': False, 'message': 'Acesso negado: Somente usuários de pedidos podem processar.'}), 403

    try:
        data = request.get_json()
        text = data.get('text', '').strip()
        if not text:
            return jsonify({'success': False, 'message': 'Nenhum texto fornecido.'}), 400

        orders = extract_shopee_orders(text)
        valid_orders = [o for o in orders if o["sku"] and o["order_id"]]
        invalid_orders = [o for o in orders if not o["sku"] or not o["order_id"]]
        invalid_no_sku = []
        corrected_order_ids = []

        conn = get_pedidos_shp_db()
        try:
            cursor = conn.cursor()
            inserted_orders = []
            failed_orders = []
            previously_invalid_ids = set()
            cursor.execute("SELECT order_id FROM pedidos_shopee WHERE checked = 0")
            existing_orders = {row['order_id'] for row in cursor.fetchall()}
            for order in invalid_orders:
                if order["order_id"] in existing_orders:
                    previously_invalid_ids.add(order["order_id"])

            for order in valid_orders:
                try:
                    cursor.execute("SELECT id FROM pedidos_shopee WHERE order_id = ? AND sku IS NULL", (order['order_id'],))
                    existing_invalid_rows = cursor.fetchall()
                    if existing_invalid_rows:
                        values = [
                            order['sku'],
                            order.get('customer_name', 'Sem Nome'),
                            order.get('notes', ''),
                            order.get('shipping_method', 'Coleta'),
                            'pending',
                            order['order_id']
                        ]
                        cursor.execute("""
                            UPDATE pedidos_shopee
                            SET sku = ?, buyer_name = ?, notes = ?, shipping_method = ?, status = ?
                            WHERE order_id = ? AND sku IS NULL
                        """, values)
                        if order['order_id'] not in corrected_order_ids:
                            corrected_order_ids.append(order['order_id'])
                        print(f'[Server] Pedido Shopee corrigido: Order_ID={order["order_id"]}, SKU={order["sku"]}, Buyer={order.get("customer_name", "Sem Nome")}, Notes={order.get("notes", "")}, Shipping={order.get("shipping_method", "Coleta")}, Updated Rows={len(existing_invalid_rows)}')
                        inserted_orders.append({
                            "id": None,
                            "order_id": order['order_id'],
                            "sku": order['sku'],
                            "buyer_name": order.get('customer_name', 'Sem Nome'),
                            "notes": order.get('notes', ''),
                            "quantity": order.get('quantity', 1),
                            "status": 'pending',
                            "shipping_method": order.get('shipping_method', 'Coleta')
                        })
                        cursor.execute("DELETE FROM pedidos_shopee WHERE order_id = ? AND sku IS NULL AND id NOT IN (SELECT MIN(id) FROM pedidos_shopee WHERE order_id = ? AND sku IS NULL)", (order['order_id'], order['order_id']))
                        print(f'[Server] Removed duplicate invalid rows for Shopee Order_ID={order["order_id"]}, Rows Deleted={cursor.rowcount}')
                        continue

                    cursor.execute("SELECT order_id, sku FROM pedidos_shopee WHERE order_id = ? AND sku = ?", (order['order_id'], order['sku']))
                    if cursor.fetchone():
                        print(f'[Server] Pedido Shopee {order["order_id"]} com SKU {order["sku"]} já existe, ignorando.')
                        continue

                    values = [
                        order['order_id'],
                        order.get('purchase_date'),
                        None,
                        order.get('customer_name', 'Sem Nome'),
                        order['sku'],
                        order.get('quantity', 1),
                        order.get('status', 'pending'),
                        0,
                        None,
                        order.get('notes', ''),
                        order.get('shipping_method', 'Coleta')
                    ]
                    cursor.execute("""
                        INSERT INTO pedidos_shopee (order_id, date_created, date_shipped, buyer_name, sku, quantity, status, checked, checked_date, notes, shipping_method)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, tuple(values))
                    cursor.execute("SELECT last_insert_rowid()")
                    order_id_db = cursor.fetchone()[0]
                    print(f'[Server] Pedido Shopee inserido: ID={order_id_db}, Order_ID={order["order_id"]}, SKU={order["sku"]}, Quantidade={order["quantity"]}, Status={order["status"]}, Notes={order.get("notes", "")}, Shipping={order.get("shipping_method", "Coleta")}')
                    inserted_orders.append({**order, "id": order_id_db})
                except sqlite3.Error as e:
                    print(f'[Server] Erro ao inserir pedido Shopee {order["order_id"]} com SKU {order["sku"]}: {str(e)}')
                    failed_orders.append({"order_id": order["order_id"], "sku": order["sku"], "error": str(e), "notes": order.get("notes", "")})
                    continue

            for order in invalid_orders:
                if not order["sku"] and order["order_id"]:
                    try:
                        if order["order_id"] in corrected_order_ids:
                            print(f'[Server] Pedido Shopee {order["order_id"]} já corrigido, ignorando inserção inválida.')
                            continue
                        cursor.execute("SELECT order_id FROM pedidos_shopee WHERE order_id = ? AND sku IS NOT NULL", (order['order_id'],))
                        if cursor.fetchone():
                            print(f'[Server] Pedido Shopee {order["order_id"]} já possui SKUs válidos, ignorando inserção inválida.')
                            continue

                        cursor.execute("SELECT order_id FROM pedidos_shopee WHERE order_id = ? AND sku IS NULL", (order['order_id'],))
                        if cursor.fetchone():
                            print(f'[Server] Pedido Shopee sem SKU {order["order_id"]} já existe, ignorando.')
                            continue

                        values = [
                            order['order_id'],
                            order.get('purchase_date'),
                            None,
                            order.get('customer_name', 'Sem Nome'),
                            None,
                            order.get('quantity', 1),
                            order.get('status', 'pending'),
                            0,
                            None,
                            order.get('notes', ''),
                            order.get('shipping_method', 'Coleta')
                        ]
                        cursor.execute("""
                            INSERT INTO pedidos_shopee (order_id, date_created, date_shipped, buyer_name, sku, quantity, status, checked, checked_date, notes, shipping_method)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, tuple(values))
                        cursor.execute("SELECT last_insert_rowid()")
                        order_id_db = cursor.fetchone()[0]
                        print(f'[Server] Pedido Shopee sem SKU inserido: ID={order_id_db}, Order_ID={order["order_id"]}, Buyer={order.get("customer_name", "Sem Nome")}, Notes={order.get("notes", "")}, Shipping={order.get("shipping_method", "Coleta")}')
                        invalid_no_sku.append({
                            "order_id": order["order_id"],
                            "buyer_name": order.get("customer_name", "Sem Nome"),
                            "error": "SKU não encontrado",
                            "notes": order.get("notes", "")
                        })
                    except sqlite3.Error as e:
                        print(f'[Server] Erro ao inserir pedido Shopee sem SKU {order["order_id"]}: {str(e)}')
                        failed_orders.append({
                            "order_id": order["order_id"],
                            "buyer_name": order.get("customer_name", "Sem Nome"),
                            "error": str(e),
                            "notes": order.get("notes", "")
                        })
                        continue
                elif not order["order_id"]:
                    invalid_no_sku.append({
                        "order_id": "N/A",
                        "buyer_name": order.get("customer_name", "Sem Nome"),
                        "error": "ID do pedido não encontrado",
                        "notes": order.get("notes", "")
                    })

            conn.commit()
        except sqlite3.Error as e:
            conn.rollback()
            print(f'[Server] Erro de banco de dados ao processar pedidos Shopee: {str(e)}')
            return jsonify({'success': False, 'message': f'Erro de banco de dados: {str(e)}'}), 500
        finally:
            conn.close()

        success_message = "Pedidos Shopee processados com sucesso."
        if previously_invalid_ids or corrected_order_ids:
            ids = list(previously_invalid_ids) + corrected_order_ids
            success_message += " IDs processados: " + ", ".join(ids)

        print(f'[Server] Processamento Shopee concluído: {len(inserted_orders)} pedidos inseridos, {len(invalid_orders)} inválidos, {len(invalid_no_sku)} sem SKU, {len(failed_orders)} falhados, {len(corrected_order_ids)} corrigidos')
        return jsonify({
            "success": True,
            "valid_orders": inserted_orders,
            "invalid_orders": invalid_orders,
            "previously_invalid_ids": list(previously_invalid_ids),
            "corrected_order_ids": corrected_order_ids,
            "success_skus": [o["sku"] for o in inserted_orders],
            "invalid_no_sku_ids": invalid_no_sku,
            "failed_orders": failed_orders,
            "message": success_message
        })

    except Exception as e:
        print(f'[Server] Erro geral ao processar pedidos Shopee: {str(e)}')
        return jsonify({'success': False, 'message': f'Erro interno: {str(e)}'}), 500
    
@app.route('/get_all_orders_shopee', methods=['GET'])
@login_required
def get_all_orders_shopee():
    if current_user.role != 'pedidos':
        return jsonify({'success': False, 'message': 'Acesso negado: Somente usuários de pedidos podem visualizar pedidos.'}), 403

    conn = get_pedidos_shp_db()
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(pedidos_shopee)")
        columns = [col[1] for col in cursor.fetchall()]
        notes_exists = 'notes' in columns
        select_notes = ", notes" if notes_exists else ""

        cursor.execute(f"""
            SELECT id, order_id, date_created, date_shipped, buyer_name, sku, quantity, status, checked{select_notes}
            FROM pedidos_shopee
            ORDER BY date_created ASC
        """)
        orders = []
        invalid_no_sku_ids = []
        failed_orders = []
        valid_order_ids = set()

        for row in cursor.fetchall():
            order_data = {
                'id': row['id'],
                'order_id': row['order_id'],
                'date_created': row['date_created'],
                'date_shipped': row['date_shipped'],
                'buyer_name': row['buyer_name'],
                'sku': row['sku'],
                'quantity': row['quantity'],
                'status': row['status'],
                'checked': row['checked'],
                'notes': row['notes'] if notes_exists else ''
            }

            if row['sku']:
                valid_order_ids.add(row['order_id'])
                orders.append(order_data)
            elif row['order_id'] and row['order_id'] not in valid_order_ids:
                invalid_no_sku_ids.append({
                    'order_id': row['order_id'],
                    'buyer_name': row['buyer_name'] or 'Sem Nome',
                    'error': 'SKU não encontrado',
                    'notes': row['notes'] if notes_exists else ''
                })
            elif row['status'] == 'failed':
                failed_orders.append({
                    'order_id': row['order_id'],
                    'buyer_name': row['buyer_name'],
                    'sku': row['sku'],
                    'error': 'Processamento falhou',
                    'notes': row['notes'] if notes_exists else ''
                })

        print(f'[Server] Retornados {len(orders)} pedidos Shopee do banco, {len(invalid_no_sku_ids)} sem SKU, {len(failed_orders)} falhados')
        print(f'[Server] Valid Shopee Order IDs: {list(valid_order_ids)}')
        return jsonify({
            'success': True,
            'orders': orders,
            'invalid_no_sku_ids': invalid_no_sku_ids,
            'failed_orders': failed_orders
        })
    finally:
        conn.close()

@app.route('/check_orders_shopee', methods=['POST'])
@login_required
def check_orders_shopee():
    if current_user.role != 'pedidos':
        return jsonify({'success': False, 'message': 'Acesso negado: Somente usuários de pedidos podem marcar pedidos.'}), 403

    try:
        data = request.get_json()
        order_ids = data.get('order_ids', [])
        producao = data.get('producao', 'Impressão').strip()
        impressora = data.get('impressora', '').strip()

        if not order_ids:
            return jsonify({'success': False, 'message': 'Nenhum ID de pedido fornecido.'}), 400

        if producao not in ['Impressão', 'Estoque']:
            return jsonify({'success': False, 'message': "Valor inválido para producao. Use 'Impressão' ou 'Estoque'."}), 400

        # Normalizar capitalização de impressora (Imp 4 → Lona)
        valid_impressoras = {
            'imp 1': 'Imp 1', 'imp1': 'Imp 1',
            'imp 2': 'Imp 2', 'imp2': 'Imp 2',
            'imp 3': 'Imp 3', 'imp3': 'Imp 3',
            'imp 4': 'Lona',  'imp4': 'Lona',
            'lona': 'Lona',
            '': ''
        }
        impressora_lower = impressora.lower()
        impressora = valid_impressoras.get(impressora_lower, impressora)
        print(f'[Server] Valor de impressora recebido: "{data.get("impressora", "")}", normalizado para: "{impressora}"')

        conn = get_pedidos_shp_db()
        try:
            cursor = conn.cursor()
            checked_date = datetime.now().strftime('%d/%m/%Y %H:%M:%S')
            checked_skus = []
            errors = []

            for order_id in order_ids:
                try:
                    cursor.execute("SELECT id, checked, sku, order_id, status, notes, shipping_method FROM pedidos_shopee WHERE id = ?", (order_id,))
                    order = cursor.fetchone()
                    if not order:
                        errors.append(f'Pedido Shopee ID {order_id} não encontrado.')
                        print(f'[Server] Erro: Pedido Shopee ID {order_id} não encontrado.')
                        continue
                    if order['checked'] == 1:
                        errors.append(f'Pedido Shopee ID {order_id} já foi checkado.')
                        print(f'[Server] Pedido Shopee ID {order_id} já checkado, ignorando.')
                        continue

                    cursor.execute(
                        "UPDATE pedidos_shopee SET checked = 1, checked_date = ?, producao = ?, impressora = ? WHERE id = ?",
                        (checked_date, producao, impressora, order_id)
                    )
                    print(f'[Server] Pedido Shopee checkado: ID={order_id}, SKU={order["sku"]}, Producao={producao}, Impressora={impressora} em {checked_date}')
                    
                    display_sku = order['sku']
                    for suffix in ['-F', '-P', '-V', '-150']:
                        if display_sku and display_sku.endswith(suffix):
                            display_sku = display_sku[:-len(suffix)]

                    checked_skus.append({
                        "id": order_id,
                        "order_id": order['order_id'],
                        "sku": order['sku'],
                        "display_sku": display_sku or '',
                        "status": order['status'],
                        "notes": order['notes'] or '',
                        "checked_date": checked_date,
                        "producao": producao,
                        "impressora": impressora
                    })
                except sqlite3.Error as e:
                    errors.append(f'Erro ao checkar pedido Shopee ID {order_id}: {str(e)}')
                    print(f'[Server] Erro ao checkar pedido Shopee ID {order_id}: {str(e)}')
                    continue

            conn.commit()
            if errors:
                return jsonify({'success': False, 'message': 'Alguns pedidos Shopee não foram checkados: ' + ', '.join(errors)}), 400
            return jsonify({
                'success': True,
                'message': 'Pedidos Shopee checkados com sucesso.',
                'checked_skus': checked_skus
            })
        except sqlite3.Error as e:
            conn.rollback()
            print(f'[Server] Erro geral ao checkar pedidos Shopee: {str(e)}')
            return jsonify({'success': False, 'message': f'Erro ao checkar pedidos: {str(e)}'}), 500
        finally:
            conn.close()
    except Exception as e:
        print(f'[Server] Erro geral no endpoint check_orders_shopee: {str(e)}')
        return jsonify({'success': False, 'message': f'Erro interno: {str(e)}'}), 500


    
    
@app.route('/checked_orders_shopee', methods=['GET'])
@login_required
def checked_orders_shopee():
    if current_user.role != 'pedidos':
        return jsonify({'success': False, 'message': 'Acesso negado: Somente usuários de pedidos podem visualizar o histórico.'}), 403

    conn = get_pedidos_shp_db()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, order_id, date_created, date_shipped, buyer_name, sku, quantity, status, checked_date, notes, shipping_method, producao, impressora
            FROM pedidos_shopee
            WHERE checked = 1
            ORDER BY checked_date DESC
        """)
        orders = [
            {
                'id': row['id'],
                'order_id': row['order_id'],
                'date_created': row['date_created'],
                'date_shipped': row['date_shipped'],
                'buyer_name': row['buyer_name'],
                'sku': row['sku'],
                'display_sku': row['sku'],
                'quantity': row['quantity'],
                'status': row['status'],
                'checked_date': row['checked_date'],
                'notes': row['notes'] or '',
                'shipping_method': row['shipping_method'] or 'Coleta',
                'producao': row['producao'] or '',
                'impressora': row['impressora'] or ''
            }
            for row in cursor.fetchall()
        ]

        for order in orders:
            display_sku = order['sku']
            for suffix in ['-F', '-P', '-V', '-150']:
                if display_sku and display_sku.endswith(suffix):
                    display_sku = display_sku[:-len(suffix)]
            order['display_sku'] = display_sku or ''

        print(f'[Server] Histórico de pedidos Shopee checkados retornado: {len(orders)} pedidos')
        return jsonify({'success': True, 'orders': orders})
    except sqlite3.Error as e:
        print(f'[Server] Erro ao carregar histórico Shopee: {str(e)}')
        return jsonify({'success': False, 'message': f'Erro ao carregar histórico: {str(e)}'}), 500
    finally:
        conn.close()
        

@app.route('/delete_invalid_order_shopee', methods=['POST'])
@login_required
def delete_invalid_order_shopee():
    if current_user.role != 'pedidos':
        return jsonify({'success': False, 'message': 'Acesso negado: Somente usuários de pedidos podem deletar.'}), 403

    data = request.get_json()
    order_id = data.get('order_id')
    if not order_id or order_id == 'N/A':
        return jsonify({'success': False, 'message': 'ID do pedido inválido.'}), 400

    conn = get_pedidos_shp_db()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM pedidos_shopee WHERE order_id = ? AND sku IS NULL AND checked = 0", (order_id,))
        rows = cursor.fetchall()
        if not rows:
            print(f'[Server] Nenhum pedido Shopee inválido encontrado para Order_ID={order_id}')
            return jsonify({'success': True, 'message': 'Nenhum pedido inválido encontrado para deletar.'})

        cursor.execute("DELETE FROM pedidos_shopee WHERE order_id = ? AND sku IS NULL AND checked = 0", (order_id,))
        deleted_rows = cursor.rowcount
        conn.commit()
        print(f'[Server] Pedido Shopee inválido deletado: Order_ID={order_id}, Rows Deleted={deleted_rows}')
        return jsonify({
            'success': True,
            'message': f'Pedido Shopee inválido {order_id} deletado com sucesso.',
            'deleted_rows': deleted_rows
        })
    except sqlite3.Error as e:
        conn.rollback()
        print(f'[Server] Erro ao deletar pedido Shopee inválido {order_id}: {str(e)}')
        return jsonify({'success': False, 'message': f'Erro ao deletar pedido: {str(e)}'}), 500
    finally:
        conn.close()









#MOTOR VC PEDIDOS 


DATABASE_VC = 'pedidos_vc.db'

def inicializar_db_vc():
    try:
        # Verifica se o arquivo do banco de dados existe
        if not os.path.exists(DATABASE_VC):
            print(f"[Server] Banco de dados {DATABASE_VC} não encontrado. Criando novo arquivo.")

        conn = sqlite3.connect(DATABASE_VC)
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS pedidos_vc (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id TEXT NOT NULL,
                sku TEXT NOT NULL,
                loja TEXT NOT NULL,
                status TEXT,
                producao TEXT,
                impressora TEXT,
                checked INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                checked_at TEXT,
                priority INTEGER DEFAULT 0
            )
        """)
        cursor.execute("PRAGMA table_info(pedidos_vc)")
        columns = [col[1] for col in cursor.fetchall()]
        if 'loja' not in columns:
            cursor.execute("ALTER TABLE pedidos_vc ADD COLUMN loja TEXT")
            cursor.execute("UPDATE pedidos_vc SET loja = 'Desconhecida' WHERE loja IS NULL")
            cursor.execute("""
                CREATE TABLE pedidos_vc_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    order_id TEXT NOT NULL,
                    sku TEXT NOT NULL,
                    loja TEXT NOT NULL,
                    status TEXT,
                    producao TEXT,
                    impressora TEXT,
                    checked INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL,
                    checked_at TEXT,
                    priority INTEGER DEFAULT 0
                )
            """)
            cursor.execute("""
                INSERT INTO pedidos_vc_new (id, order_id, sku, loja, status, producao, impressora, checked, created_at, checked_at, priority)
                SELECT id, order_id, sku, loja, status, producao, impressora, checked, created_at, checked_at, priority
                FROM pedidos_vc
            """)
            cursor.execute("DROP TABLE pedidos_vc")
            cursor.execute("ALTER TABLE pedidos_vc_new RENAME TO pedidos_vc")
        if 'checked_at' not in columns:
            cursor.execute("ALTER TABLE pedidos_vc ADD COLUMN checked_at TEXT")
        if 'priority' not in columns:
            cursor.execute("ALTER TABLE pedidos_vc ADD COLUMN priority INTEGER DEFAULT 0")
        conn.commit()
        print("[Server] Tabela pedidos_vc verificada/criada com sucesso. Colunas 'loja', 'checked_at' e 'priority' garantidas.")
    except sqlite3.Error as e:
        print(f"[Server] Erro ao inicializar pedidos_vc.db: {str(e)}")
        raise  # Levanta a exceção para depuração
    finally:
        conn.close()

# Chama a inicialização do banco de dados ao carregar o módulo
inicializar_db_vc()

def extract_vc_orders(data):
    if not data or not isinstance(data, dict):
        return []

    orders = []
    order_id = data.get('order_id', '').strip()
    raw_skus = data.get('sku', '').strip().upper()
    loja = data.get('loja', '').strip().capitalize()
    item_type = data.get('item_type', '').strip().capitalize()
    priority = data.get('priority', False)

    if not order_id or not loja:
        return []

    if loja not in ['Whatsapp', 'Shein', 'Site', 'Magalu']:
        return []

    # Caso seja Oxford, Malha, Lona ou Decor
    if item_type in ['Oxford', 'Malha', 'Lona', 'Decor']:
        sku = f"{order_id} {item_type.upper()}"
        orders.append({
            "order_id": order_id,
            "sku": sku,
            "loja": loja,
            "quantity": 1,
            "status": "pendente",
            "priority": priority
        })
    elif raw_skus:
        for sku in raw_skus.split(','):
            sku = sku.strip().upper()
            if sku:
                orders.append({
                    "order_id": order_id,
                    "sku": sku,
                    "loja": loja,
                    "quantity": 1,
                    "status": "pendente",
                    "priority": priority
                })

    return orders


# Agrupar por seção
def agrupar_por_secao_vc(orders):
    secoes = {
        'CL': [], 'FF': [], 'KD': [], 'KC': [], 'PC': [], 'PR': [], 'PV': [],
        'PV-ESPECIAL': [], 'PH': [], 'TP': [], 'VC': [], 'FH': [], 'RV': [],
        'ITENS_ESPECIAIS': []
    }

    for order in orders:
        sku = order["sku"]

        if not sku:
            continue

        # Detectar itens especiais (Oxford, Malha, etc)
        if any(x in sku.upper() for x in ['OXFORD', 'MALHA', 'LONA', 'DECOR']):
            if sku not in secoes['ITENS_ESPECIAIS']:
                secoes['ITENS_ESPECIAIS'].append(sku)
        else:
            for secao in secoes:
                if secao != 'ITENS_ESPECIAIS' and sku.startswith(secao):
                    if sku not in secoes[secao]:
                        secoes[secao].append(sku)
                    break

    return secoes




# Rota para processar pedidos
@app.route('/process_vc', methods=['POST'])
@login_required
def process_vc():
    if current_user.role != 'pedidos':
        return jsonify({'success': False, 'message': 'Acesso negado: Apenas usuário Pedidos pode processar.'}), 403

    data = request.get_json()
    if not data or not all(key in data for key in ['order_id', 'sku', 'loja']):
        return jsonify({'success': False, 'message': 'Campos ID, SKU e Loja são obrigatórios.', 'inserted_orders': [], 'nao_processados': []}), 400

    orders = extract_vc_orders(data)
    if not orders:
        return jsonify({'success': False, 'message': 'Dados do pedido inválidos.', 'inserted_orders': [], 'nao_processados': []}), 400

    try:
        # Garante que a tabela existe antes de processar
        inicializar_db_vc()

        conn = sqlite3.connect(DATABASE_VC)
        cursor = conn.cursor()
        inserted_orders = []
        nao_processados = []

        for order in orders:
            order_id = order['order_id']
            sku = order['sku']
            loja = order['loja']
            priority = 1 if order.get('priority', False) else 0

            # Insere o pedido sem verificar duplicatas
            cursor.execute("""
                INSERT INTO pedidos_vc (order_id, sku, loja, status, checked, created_at, priority)
                VALUES (?, ?, ?, ?, ?, datetime('now'), ?)
            """, (order_id, sku, loja, 'pendente', 0, priority))
            cursor.execute("SELECT last_insert_rowid()")
            order_id_db = cursor.fetchone()[0]
            inserted_orders.append({
                'id': order_id_db,
                'order_id': order_id,
                'sku': sku,
                'loja': loja,
                'priority': bool(priority)
            })

        conn.commit()
        return jsonify({
            'success': True if inserted_orders else False,
            'message': f'{len(inserted_orders)} pedido(s) processado(s) com sucesso.',
            'inserted_orders': inserted_orders,
            'nao_processados': nao_processados
        })
    except sqlite3.Error as e:
        conn.rollback()
        print(f"[Server] Erro no banco de dados: {str(e)}")
        return jsonify({'success': False, 'message': f'Erro no banco de dados: {str(e)}', 'inserted_orders': [], 'nao_processados': []}), 500
    finally:
        conn.close()
        

@app.route('/get_all_orders_vc')
@login_required
def get_all_orders_vc():
    if current_user.role != 'pedidos':
        return jsonify({'success': False, 'message': 'Acesso negado.'}), 403

    try:
        conn = sqlite3.connect(DATABASE_VC)
        cursor = conn.cursor()
        cursor.execute("SELECT id, order_id, sku, loja, checked, status, producao, impressora, created_at, checked_at, priority FROM pedidos_vc ORDER BY created_at DESC")
        rows = cursor.fetchall()
        orders = []
        for row in rows:
            created_at = datetime.strptime(row[8], "%Y-%m-%d %H:%M:%S").strftime("%d/%m/%Y %H:%M:%S") if row[8] else None
            checked_at = datetime.strptime(row[9], "%Y-%m-%d %H:%M:%S").strftime("%d/%m/%Y %H:%M:%S") if row[9] else None
            orders.append({
                "id": row[0],
                "order_id": row[1],
                "sku": row[2],
                "loja": row[3],
                "checked": bool(row[4]),
                "status": row[5],
                "producao": row[6],
                "impressora": row[7],
                "created_at": created_at,
                "checked_at": checked_at,
                "priority": bool(row[10])  # Adiciona o campo priority
            })

        cursor.execute("SELECT order_id, status FROM pedidos_vc WHERE sku IS NULL AND checked = 0")
        invalid_orders = [{"order_id": row[0], "sku": None, "error": "SKU não encontrado", "status": row[1]} for row in cursor.fetchall()]

        # Agrupar por seção para exibir corretamente
        secoes = agrupar_por_secao_vc(orders)

        conn.close()
        return jsonify({
            "success": True,
            "orders": orders,
            "sections": secoes,
            "invalid_orders": invalid_orders
        })

    except sqlite3.Error as e:
        return jsonify({'success': False, 'message': f'Erro ao obter pedidos: {str(e)}'}), 500


@app.route('/check_selected_orders_vc', methods=['POST'])
@login_required
def check_selected_orders_vc():
    if current_user.role != 'pedidos':
        return jsonify({'success': False, 'message': 'Acesso negado.'}), 403

    data = request.get_json()
    ids = data.get('ids', [])
    producao = data.get('producao', '')
    impressora = data.get('impressora', '')

    if not ids:
        return jsonify({'success': False, 'message': 'Nenhum pedido selecionado.'}), 400
    if not producao and not impressora:
        return jsonify({'success': False, 'message': 'Produção ou impressora deve ser fornecido.'}), 400

    # Normalizar capitalização de impressora
    valid_impressoras = {
        'imp 1': 'Imp 1', 'imp1': 'Imp 1',
        'imp 2': 'Imp 2', 'imp2': 'Imp 2',
        'imp 3': 'Imp 3', 'imp3': 'Imp 3',
        'imp 4': 'Lona', 'imp4': 'Lona',
        'lona': 'Lona',
        '': ''
    }
    impressora_lower = impressora.lower()
    impressora = valid_impressoras.get(impressora_lower, impressora)
    print(f'[Server] Valor de impressora recebido: "{data.get("impressora", "")}", normalizado para: "{impressora}"')

    try:
        conn = sqlite3.connect(DATABASE_VC)
        cursor = conn.cursor()
        now_brasilia = datetime.now(timezone(timedelta(hours=-3))).strftime("%Y-%m-%d %H:%M:%S")
        checked_orders = []
        errors = []

        for order_id in ids:
            # Verificar se o pedido já foi checkado
            cursor.execute("SELECT checked FROM pedidos_vc WHERE id = ?", (order_id,))
            result = cursor.fetchone()
            if not result:
                errors.append(f'Pedido ViaCores ID {order_id} não encontrado.')
                print(f'[Server] Erro: Pedido ViaCores ID {order_id} não encontrado.')
                continue
            if result[0] == 1:  # checked
                errors.append(f'Pedido ViaCores ID {order_id} já foi checkado.')
                print(f'[Server] Pedido ViaCores ID {order_id} já checkado, ignorando.')
                continue

            # Atualizar o pedido
            cursor.execute('''
                UPDATE pedidos_vc
                SET checked = 1, producao = ?, impressora = ?, checked_at = ?
                WHERE id = ?
            ''', (producao, impressora, now_brasilia, order_id))

            # Buscar detalhes do pedido atualizado
            cursor.execute('''
                SELECT id, order_id, sku, loja, status
                FROM pedidos_vc
                WHERE id = ?
            ''', (order_id,))
            row = cursor.fetchone()
            if row:
                checked_orders.append({
                    "id": row[0],
                    "order_id": row[1],
                    "sku": row[2],
                    "loja": row[3],
                    "status": row[4]
                })

        if errors and not checked_orders:
            conn.rollback()
            return jsonify({'success': False, 'message': 'Nenhum pedido foi checkado: ' + ', '.join(errors)}), 400

        conn.commit()
        return jsonify({
            "success": True,
            "message": "Pedidos checkados com sucesso.",
            "checked_orders": checked_orders
        })
    except sqlite3.Error as e:
        conn.rollback()
        print(f'[Server] Erro geral ao checkar pedidos ViaCores: {str(e)}')
        return jsonify({'success': False, 'message': f'Erro ao checkar pedidos: {str(e)}'}), 500
    finally:
        conn.close()

@app.route('/reset_selected_checks_vc', methods=['POST'])
@login_required
def reset_selected_checks_vc():
    if current_user.role != 'pedidos':
        return jsonify({'success': False, 'message': 'Acesso negado.'}), 403

    try:
        conn = sqlite3.connect(DATABASE_VC)
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE pedidos_vc SET checked = 0, producao = '', impressora = '', checked_at = NULL
            WHERE checked = 1
        ''')
        conn.commit()
        return jsonify({"success": True, "message": "Checks resetados com sucesso."})
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({'success': False, 'message': f'Erro ao resetar checks: {str(e)}'}), 500
    finally:
        conn.close()

@app.route('/get_checked_orders_vc')
@login_required
def get_checked_orders_vc():
    if current_user.role != 'pedidos':
        return jsonify({'success': False, 'message': 'Acesso negado.'}), 403

    try:
        conn = sqlite3.connect(DATABASE_VC)
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, order_id, sku, loja, producao, impressora, checked_at
            FROM pedidos_vc
            WHERE checked = 1
            ORDER BY checked_at DESC
        ''')
        rows = cursor.fetchall()
        dados = []
        for row in rows:
            checked_at = datetime.strptime(row[6], "%Y-%m-%d %H:%M:%S").strftime("%d/%m/%Y %H:%M:%S") if row[6] else None
            dados.append({
                "id": row[0],
                "order_id": row[1],
                "sku": row[2],
                "loja": row[3],
                "producao": row[4],
                "impressora": row[5],
                "checked_at": checked_at
            })
        conn.close()
        return jsonify({"success": True, "orders": dados})
    except sqlite3.Error as e:
        return jsonify({'success': False, 'message': f'Erro ao obter pedidos checkados: {str(e)}'}), 500

@app.route('/delete_invalid_order_vc', methods=['POST'])
@login_required
def delete_invalid_order_vc():
    if current_user.role != 'pedidos':
        return jsonify({'success': False, 'message': 'Acesso negado.'}), 403

    data = request.get_json()
    order_id = data.get('order_id')
    if not order_id:
        return jsonify({'success': False, 'message': 'ID do pedido inválido.'}), 400

    try:
        conn = sqlite3.connect(DATABASE_VC)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM pedidos_vc WHERE order_id = ? AND sku IS NULL AND checked = 0", (order_id,))
        conn.commit()
        return jsonify({"success": True, "message": "Pedido inválido deletado com sucesso."})
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({'success': False, 'message': f'Erro ao deletar pedido: {str(e)}'}), 500
    finally:
        conn.close()










"""PRODUÇÃO PEDIDOS MERCADO LIVRE"""


# Substituir a rota /producao
@app.route('/producao', methods=['GET'])
@login_required
def producao():
    if current_user.role != 'producao':
        flash('Acesso negado: Esta página é exclusiva para o usuário Produção.', 'error')
        print(f'[Server] Acesso negado para {current_user.username} (role={current_user.role}) em /producao')
        return redirect(url_for('index' if current_user.role == 'admin' else 'login'))

    # Mercado Livre
    conn_ml = get_producao_ml_db()
    try:
        cursor_ml = conn_ml.cursor()
        cursor_ml.execute("""
            SELECT id, order_id, date_created, date_shipped, sku, quantity, status, checked, producao, info_data
            FROM pedidos
            WHERE checked = 0
            ORDER BY date_created ASC
        """)
        orders_ml = [
            {
                'id': row['id'],
                'order_id': row['order_id'],
                'date_created': row['date_created'],
                'date_shipped': row['date_shipped'] or '',
                'sort_key': parse_date_or_day(row['date_shipped'] or '')[0],
                'display_date': parse_date_or_day(row['date_shipped'] or '')[1],
                'sku': row['sku'],
                'quantity': row['quantity'],
                'status': row['status'],
                'checked': row['checked'],
                'producao': row['producao'] or '',
                'info_data': json.loads(row['info_data']) if row['info_data'] else {},
                'highlight': row['status'] == 'motoboy'
            }
            for row in cursor_ml.fetchall()
        ]

        sections_ml = {
            'CL': [], 'FF': [], 'KD': [], 'KC': [], 'PC': [], 'PR': [],
            'PV': [], 'PV-ESPECIAL': [], 'PH': [], 'TP': [], 'VC': [], 'RV': []
        }
        invalid_no_sku_ids_ml = []
        valid_order_ids_ml = set()

        for order in orders_ml:
            if order['sku'] and len(order['sku']) >= 2 and not order['checked']:
                valid_order_ids_ml.add(order['order_id'])
                clean_sku = re.sub(r'-(P|F|V)$', '', order['sku'], flags=re.IGNORECASE)
                if clean_sku.startswith('PV') and clean_sku.endswith(('-100', '-999', '-VF')):
                    sections_ml['PV-ESPECIAL'].append(order)
                elif clean_sku.startswith('PV'):
                    sections_ml['PV'].append(order)
                else:
                    prefix = clean_sku[:2]
                    if prefix in sections_ml:
                        sections_ml[prefix].append(order)

        cursor_ml.execute("""
            SELECT order_id, sku, status, checked
            FROM pedidos
            WHERE checked = 0 AND sku IS NULL
        """)
        for row in cursor_ml.fetchall():
            order_id = row['order_id']
            if order_id and order_id not in valid_order_ids_ml and not row['checked']:
                invalid_no_sku_ids_ml.append({
                    'order_id': order_id,
                    'error': 'SKU não encontrado',
                    'status': row['status']
                })

        cursor_ml.execute("SELECT info_data FROM pedidos WHERE info_data IS NOT NULL ORDER BY id DESC LIMIT 1")
        info_data_row = cursor_ml.fetchone()
        info_data = json.loads(info_data_row['info_data']) if info_data_row and info_data_row['info_data'] else {}

    finally:
        conn_ml.close()

    # Shopee
    conn_shopee = get_producao_shopee_db()
    try:
        cursor_shopee = conn_shopee.cursor()
        cursor_shopee.execute("""
            SELECT id, order_id, sku, status, checked
            FROM pedidos_shopee
            WHERE checked = 0
            ORDER BY sku ASC
        """)
        orders_shopee = [
            {
                'id': row['id'],
                'order_id': row['order_id'],
                'sku': row['sku'],
                'status': row['status'],
                'checked': row['checked']
            }
            for row in cursor_shopee.fetchall()
        ]

        # Buscar o último valor de coleta_shopee da tabela shopee_info
        cursor_shopee.execute("SELECT coleta_info FROM shopee_info ORDER BY saved_date DESC LIMIT 1")
        coleta_row = cursor_shopee.fetchone()
        if coleta_row:
            info_data['coleta_shopee'] = coleta_row['coleta_info']
            print(f'[Server] Valor de coleta_shopee recuperado: {coleta_row["coleta_info"]}')
        else:
            info_data['coleta_shopee'] = ''  # Define como vazio se não houver registro
            print('[Server] Nenhum valor de coleta_shopee encontrado na tabela shopee_info')

        sections_shopee = {
            'CL': [], 'FF': [], 'KD': [], 'KC': [], 'PC': [], 'PR': [],
            'PV': [], 'PV-ESPECIAL': [], 'PH': [], 'TP': [], 'VC': [], 'RV': []
        }
        invalid_no_sku_ids_shopee = []
        valid_order_ids_shopee = set()

        for order in orders_shopee:
            if order['sku'] and len(order['sku']) >= 2 and not order['checked']:
                valid_order_ids_shopee.add(order['order_id'])
                clean_sku = re.sub(r'-(P|F|V)$', '', order['sku'], flags=re.IGNORECASE)
                if clean_sku.startswith('PV') and clean_sku.endswith(('-100', '-999', '-VF')):
                    sections_shopee['PV-ESPECIAL'].append(order)
                elif clean_sku.startswith('PV'):
                    sections_shopee['PV'].append(order)
                else:
                    prefix = clean_sku[:2]
                    if prefix in sections_shopee:
                        sections_shopee[prefix].append(order)

        cursor_shopee.execute("""
            SELECT order_id, sku, status, checked
            FROM pedidos_shopee
            WHERE checked = 0 AND sku IS NULL
        """)
        for row in cursor_shopee.fetchall():
            order_id = row['order_id']
            if order_id and order_id not in valid_order_ids_shopee and not row['checked']:
                invalid_no_sku_ids_shopee.append({
                    'order_id': order_id,
                    'error': 'SKU não encontrado',
                    'status': row['status']
                })

    finally:
        conn_shopee.close()

    return render_template(
        'producao.html',
        orders=orders_ml,
        sections=sections_ml,
        invalid_no_sku_ids=invalid_no_sku_ids_ml,
        info_data=info_data,
        shopee_sections=sections_shopee,
        invalid_no_sku_ids_shopee=invalid_no_sku_ids_shopee
    )

# Substituir a rota /save_info_data
@app.route('/save_info_data', methods=['POST'])
@login_required
def save_info_data():
    if current_user.role != 'producao':
        return jsonify({'success': False, 'message': 'Acesso negado: Somente usuários de produção podem salvar informações.'}), 403

    data = request.get_json()
    info_data = data.get('info_data', {})
    
    if not info_data:
        return jsonify({'success': False, 'message': 'Nenhum dado de informação fornecido.'}), 400

    conn = get_producao_ml_db()
    
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM pedidos ORDER BY id DESC LIMIT 1")
        last_order = cursor.fetchone()
        
        if last_order:
            cursor.execute("UPDATE pedidos SET info_data = ? WHERE id = ?", (json.dumps(info_data), last_order['id']))
            print(f'[Server] Informações salvas para pedido ID={last_order["id"]}: {info_data}')
        else:
            cursor.execute("INSERT INTO pedidos (order_id, date_created, quantity, status, checked, info_data) VALUES (?, ?, ?, ?, ?, ?)",
                          ('TEMP_INFO', datetime.now().strftime('%Y-%m-%d %H:%M:%S'), 1, 'coleta', 0, json.dumps(info_data)))
            print(f'[Server] Informações salvas em registro temporário: {info_data}')
        
        conn.commit()
        return jsonify({'success': True, 'message': 'Informações salvas com sucesso!'})
    except sqlite3.Error as e:
        conn.rollback()
        print(f'[Server] Erro ao salvar info_data: {str(e)}')
        return jsonify({'success': False, 'message': f'Erro ao salvar informações: {str(e)}'}), 500
    finally:
        conn.close()

@app.route('/process_orders_ml_producao', methods=['POST'])
@login_required
def process_orders_ml_producao():
    if current_user.role != 'producao':
        return jsonify({'success': False, 'message': 'Acesso negado'}), 403

    data = request.get_json()
    text = data.get('text', '')
    info_data = data.get('info_data', {})  # Recebe os dados do container

    if not text:
        return jsonify({'success': False, 'message': 'Nenhum texto fornecido'}), 400

    try:
        orders, invalid_orders = extract_orders_producao(text)
        if not orders and not invalid_orders:
            return jsonify({'success': False, 'message': 'Nenhum pedido válido ou inválido encontrado'}), 400

        conn = get_producao_ml_db()
        cursor = conn.cursor()
        inserted_orders = []
        inserted_invalid_orders = []

        # Carregar todos os pedidos existentes (checked = 0 e checked = 1)
        existing_orders = set()
        checked_orders = set()
        cursor.execute("SELECT order_id, sku FROM pedidos WHERE checked = 0")
        for row in cursor.fetchall():
            existing_orders.add((row['order_id'], row['sku'] or ''))
        cursor.execute("SELECT order_id FROM pedidos WHERE checked = 1")
        for row in cursor.fetchall():
            checked_orders.add(row['order_id'])

        # Log para depuração do info_data recebido
        print(f'[Server] Info_data recebido: {info_data}')

        # Processar pedidos válidos
        for order in orders:
            if not isinstance(order, dict) or not order.get('sku') or not order.get('order_id'):
                invalid_orders.append({
                    'order_id': order.get('order_id', 'N/A') if isinstance(order, dict) else 'N/A',
                    'error': 'Formato inválido ou SKU/Order ID ausente',
                    'status': order.get('status', 'coleta') if isinstance(order, dict) else 'coleta'
                })
                print(f'[Server] Pedido inválido: {order}')
                continue

            if order['order_id'] in checked_orders:
                print(f'[Server] Ignorando pedido já checkado: Order_ID={order["order_id"]}, SKU={order["sku"]}')
                continue

            cursor.execute("DELETE FROM pedidos WHERE order_id = ? AND sku IS NULL AND checked = 0", (order['order_id'],))
            if cursor.rowcount > 0:
                print(f'[Server] Removido pedido inválido existente: Order_ID={order["order_id"]}')

            if (order['order_id'], order['sku']) in existing_orders:
                print(f'[Server] Ignorando pedido já processado: Order_ID={order["order_id"]}, SKU={order["sku"]}')
                cursor.execute("SELECT id FROM pedidos WHERE order_id = ? AND sku = ?", (order['order_id'], order['sku']))
                order_id_db = cursor.fetchone()[0]
                inserted_orders.append({
                    'id': order_id_db,
                    'order_id': order['order_id'],
                    'sku': order['sku'],
                    'date_shipped': order['date_shipped'],
                    'display_date': format_display_date(order['date_shipped'])[0],
                    'sort_key': format_display_date(order['date_shipped'])[1].strftime('%Y-%m-%d'),
                    'quantity': order['quantity'],
                    'status': order['status'],
                    'info_data': json.dumps(info_data) if info_data else None  # Garantir que info_data seja salvo
                })
                continue

            try:
                # Verificar e converter info_data para string JSON
                info_data_str = json.dumps(info_data) if info_data and isinstance(info_data, (dict, list)) else None
                print(f'[Server] Salvando info_data para Order_ID={order["order_id"]}, SKU={order["sku"]}: {info_data_str}')

                cursor.execute("""
                    INSERT INTO pedidos (order_id, date_created, date_shipped, sku, quantity, status, checked, producao, info_data)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    order['order_id'],
                    order['date_created'],
                    order['date_shipped'],
                    order['sku'],
                    order['quantity'],
                    order['status'],
                    order['checked'],
                    order['producao'],
                    info_data_str  # Usar o valor convertido
                ))
                cursor.execute("SELECT last_insert_rowid()")
                order_id_db = cursor.fetchone()[0]
                inserted_orders.append({
                    'id': order_id_db,
                    'order_id': order['order_id'],
                    'sku': order['sku'],
                    'date_shipped': order['date_shipped'],
                    'display_date': format_display_date(order['date_shipped'])[0],
                    'sort_key': format_display_date(order['date_shipped'])[1].strftime('%Y-%m-%d'),
                    'quantity': order['quantity'],
                    'status': order['status'],
                    'info_data': info_data_str  # Retornar o valor salvo
                })
                print(f'[Server] Inserido pedido: Order_ID={order["order_id"]}, SKU={order["sku"]}, Info_Data={info_data_str}')
            except sqlite3.Error as e:
                print(f'[Server] Erro ao inserir pedido {order["order_id"]} SKU {order["sku"]}: {str(e)}')
                invalid_orders.append({
                    'order_id': order['order_id'],
                    'error': f'Erro ao inserir no banco: {str(e)}',
                    'status': order['status']
                })
                continue

        # Processar pedidos inválidos (sem SKU)
        for invalid_order in invalid_orders:
            if not invalid_order.get('order_id') or invalid_order['order_id'] == 'N/A':
                print(f'[Server] Ignorando pedido inválido sem Order_ID válido: {invalid_order}')
                continue

            if invalid_order['order_id'] in checked_orders:
                print(f'[Server] Ignorando pedido inválido já checkado: Order_ID={invalid_order["order_id"]}')
                continue

            cursor.execute("SELECT id FROM pedidos WHERE order_id = ? AND sku IS NOT NULL AND checked = 0", (invalid_order['order_id'],))
            if cursor.fetchone():
                print(f'[Server] Ignorando pedido inválido {invalid_order["order_id"]} pois já existe um pedido válido com SKU')
                continue

            cursor.execute("SELECT id FROM pedidos WHERE order_id = ? AND sku IS NULL AND checked = 0", (invalid_order['order_id'],))
            existing_invalid = cursor.fetchone()
            if existing_invalid:
                try:
                    info_data_str = json.dumps(info_data) if info_data and isinstance(info_data, (dict, list)) else None
                    print(f'[Server] Atualizando info_data para Order_ID={invalid_order["order_id"]}: {info_data_str}')
                    cursor.execute("""
                        UPDATE pedidos
                        SET date_created = ?, date_shipped = ?, quantity = ?, status = ?, checked = 0, producao = ?, info_data = ?
                        WHERE id = ?
                    """, (
                        datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                        '',
                        1,
                        invalid_order['status'],
                        '',
                        info_data_str,
                        existing_invalid['id']
                    ))
                    inserted_invalid_orders.append({
                        'id': existing_invalid['id'],
                        'order_id': invalid_order['order_id'],
                        'error': invalid_order['error'],
                        'status': invalid_order['status'],
                        'info_data': info_data_str
                    })
                    print(f'[Server] Atualizado pedido inválido: Order_ID={invalid_order["order_id"]}, Error={invalid_order["error"]}, Info_Data={info_data_str}')
                except sqlite3.Error as e:
                    print(f'[Server] Erro ao atualizar pedido inválido {invalid_order["order_id"]}: {str(e)}')
                    continue
            else:
                try:
                    info_data_str = json.dumps(info_data) if info_data and isinstance(info_data, (dict, list)) else None
                    print(f'[Server] Inserindo info_data para Order_ID={invalid_order["order_id"]}: {info_data_str}')
                    cursor.execute("""
                        INSERT INTO pedidos (order_id, date_created, date_shipped, sku, quantity, status, checked, producao, info_data)
                        VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)
                    """, (
                        invalid_order['order_id'],
                        datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                        '',
                        1,
                        invalid_order['status'],
                        0,
                        '',
                        info_data_str
                    ))
                    cursor.execute("SELECT last_insert_rowid()")
                    order_id_db = cursor.fetchone()[0]
                    inserted_invalid_orders.append({
                        'id': order_id_db,
                        'order_id': invalid_order['order_id'],
                        'error': invalid_order['error'],
                        'status': invalid_order['status'],
                        'info_data': info_data_str
                    })
                    print(f'[Server] Inserido pedido inválido: Order_ID={invalid_order["order_id"]}, Error={invalid_order["error"]}, Info_Data={info_data_str}')
                except sqlite3.Error as e:
                    print(f'[Server] Erro ao inserir pedido inválido {invalid_order["order_id"]}: {str(e)}')
                    continue

        conn.commit()

        sections = defaultdict(list)
        section_sort_keys = {}

        for order in inserted_orders:
            display_date, date_obj = format_display_date(order['date_shipped'])
            order['display_date'] = display_date
            order['sort_key'] = date_obj.strftime('%Y-%m-%d')
            sections[display_date].append(order)
            section_sort_keys[display_date] = date_obj
        sorted_sections = sorted(sections.items(), key=lambda item: section_sort_keys[item[0]])

        print(f'[Server] Inseridos {len(inserted_orders)} pedidos válidos, {len(inserted_invalid_orders)} pedidos inválidos')
        return jsonify({
            'success': True,
            'message': 'Pedidos processados com sucesso!',
            'orders': inserted_orders,
            'invalid_orders': inserted_invalid_orders,
            'sections': dict(sorted_sections)
        }), 200

    except sqlite3.Error as e:
        conn.rollback()
        print(f'[Server] Erro ao processar pedidos: {str(e)}')
        return jsonify({'success': False, 'message': f'Erro ao processar pedidos: {str(e)}'}), 500
    except Exception as e:
        print(f'[Server] Erro geral: {str(e)}')
        return jsonify({'success': False, 'message': f'Erro interno: {str(e)}'}), 500
    finally:
        conn.close()

@app.route('/get_all_orders_producao', methods=['GET'])
@login_required
def get_all_orders_producao():
    if current_user.role != 'producao':
        return jsonify({'success': False, 'message': 'Acesso negado: Somente usuários de produção podem visualizar pedidos.'}), 403

    conn = get_producao_ml_db()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, order_id, date_created, date_shipped, sku, quantity, status, checked
            FROM pedidos
            ORDER BY date_created ASC
        """)
        orders = []
        invalid_no_sku_ids = []
        valid_order_ids = set()

        for row in cursor.fetchall():
            order_data = {
                'id': row['id'],
                'order_id': row['order_id'],
                'date_created': row['date_created'],
                'date_shipped': row['date_shipped'],
                'sku': row['sku'],
                'quantity': row['quantity'],
                'status': row['status'],
                'checked': row['checked']
            }

            if row['sku']:
                valid_order_ids.add(row['order_id'])
                orders.append(order_data)
            elif row['order_id'] and row['order_id'] not in valid_order_ids:
                invalid_no_sku_ids.append({
                    'order_id': row['order_id'],
                    'error': 'SKU não encontrado',
                    'status': row['status']
                })

        print(f'[Server] Retornados {len(orders)} pedidos do banco producao_ml.db, {len(invalid_no_sku_ids)} sem SKU')
        print(f'[Server] Valid Order IDs: {list(valid_order_ids)}')
        return jsonify({
            'success': True,
            'orders': orders,
            'invalid_no_sku_ids': invalid_no_sku_ids
        })
    finally:
        conn.close()

@app.route('/delete_invalid_order_producao', methods=['POST'])
@login_required
def delete_invalid_order_producao():
    if current_user.role != 'producao':
        return jsonify({'success': False, 'message': 'Acesso negado: Somente usuários de produção podem deletar.'}), 403

    data = request.get_json()
    order_id = data.get('order_id')
    if not order_id or order_id == 'N/A':
        return jsonify({'success': False, 'message': 'ID do pedido inválido.'}), 400

    conn = get_producao_ml_db()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM pedidos WHERE order_id = ? AND sku IS NULL AND checked = 0", (order_id,))
        rows = cursor.fetchall()
        if not rows:
            print(f'[Server] Nenhum pedido inválido encontrado para Order_ID={order_id} em producao_ml.db')
            return jsonify({'success': True, 'message': 'Nenhum pedido inválido encontrado para deletar.'})

        cursor.execute("DELETE FROM pedidos WHERE order_id = ? AND sku IS NULL AND checked = 0", (order_id,))
        deleted_rows = cursor.rowcount
        conn.commit()
        print(f'[Server] Pedido inválido deletado: Order_ID={order_id}, Rows Deleted={deleted_rows} em producao_ml.db')
        return jsonify({
            'success': True,
            'message': f'Pedido inválido {order_id} deletado com sucesso.',
            'deleted_rows': deleted_rows
        })
    except sqlite3.Error as e:
        conn.rollback()
        print(f'[Server] Erro ao deletar pedido inválido {order_id}: {str(e)}')
        return jsonify({'success': False, 'message': f'Erro ao deletar pedido: {str(e)}'}), 500
    finally:
        conn.close()

@app.route('/check_orders_producao', methods=['POST'])
@login_required
def check_orders_producao():
    if current_user.role != 'producao':
        return jsonify({'success': False, 'message': 'Acesso negado: Somente usuários de produção podem marcar pedidos.'}), 403

    data = request.get_json()
    order_ids = data.get('order_ids', [])
    action = data.get('action', 'check')

    if not order_ids:
        return jsonify({'success': False, 'message': 'Nenhum ID de pedido fornecido.'}), 400

    producao_status = 'Estoque' if action == 'estoque' else 'Costura'
    conn = get_producao_ml_db()
    try:
        cursor = conn.cursor()
        checked_date = datetime.now().strftime('%d/%m/%Y %H:%M:%S')
        checked_skus = []
        errors = []

        for order_id in order_ids:
            try:
                cursor.execute("SELECT id, checked, sku, order_id, status FROM pedidos WHERE id = ?", (order_id,))
                order = cursor.fetchone()
                if not order:
                    errors.append(f'Pedido ID {order_id} não encontrado.')
                    print(f'[Server] Erro: Pedido ID {order_id} não encontrado em producao_ml.db.')
                    continue
                if order['checked'] == 1:
                    errors.append(f'Pedido ID {order_id} já foi checkado.')
                    print(f'[Server] Pedido ID {order_id} já checkado, ignorando.')
                    continue

                cursor.execute(
                    "UPDATE pedidos SET checked = 1, checked_date = ?, producao = ? WHERE id = ?",
                    (checked_date, producao_status, order_id)
                )
                print(f'[Server] Pedido checkado: ID={order_id}, SKU={order["sku"]}, Producao={producao_status} em {checked_date} em producao_ml.db')
                checked_skus.append({
                    "id": order_id,
                    "order_id": order['order_id'],
                    "sku": order['sku'],
                    "status": order['status'],
                    "checked_date": checked_date,
                    "producao": producao_status
                })
            except sqlite3.Error as e:
                errors.append(f'Erro ao checkar pedido ID {order_id}: {str(e)}')
                print(f'[Server] Erro ao checkar pedido ID {order_id}: {str(e)}')
                continue

        conn.commit()
        if errors:
            return jsonify({'success': False, 'message': 'Alguns pedidos não foram checkados: ' + ', '.join(errors)}), 400
        return jsonify({
            'success': True,
            'message': f'Pedidos marcados como {producao_status} com sucesso.',
            'checked_skus': checked_skus
        })
    except sqlite3.Error as e:
        conn.rollback()
        print(f'[Server] Erro geral ao checkar pedidos: {str(e)}')
        return jsonify({'success': False, 'message': f'Erro ao processar pedidos: {str(e)}'}), 500
    finally:
        conn.close()

@app.route('/get_checked_orders_producao', methods=['GET'])
@login_required
def get_checked_orders_producao():
    if current_user.role != 'producao':
        return jsonify({'success': False, 'message': 'Acesso negado: Somente usuários de produção podem acessar esta rota.'}), 403

    conn = get_producao_ml_db()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, order_id, sku, status, checked_date, date_shipped, producao FROM pedidos WHERE checked = 1")
        orders = cursor.fetchall()
        orders_list = [
            {
                'id': order[0],
                'order_id': order[1],
                'sku': order[2],
                'status': order[3],
                'checked_date': order[4],
                'date_shipped': parse_date_or_day(order[5] or '')[1],  # Usar display_text de parse_date_or_day                
                'producao': order[6]
            } for order in orders
        ]
        print(f'[Server] Pedidos checkados retornados: {len(orders_list)}')
        return jsonify({'success': True, 'orders': orders_list})
    except sqlite3.Error as e:
        print(f'[Server] Erro ao obter pedidos checkados: {str(e)}')
        return jsonify({'success': False, 'message': f'Erro ao obter pedidos checkados: {str(e)}'}), 500
    finally:
        conn.close()


@app.route('/reset_order_producao', methods=['POST'])
@login_required
def reset_order_producao():
    if current_user.role != 'producao':
        return jsonify({'success': False, 'message': 'Acesso negado: Somente usuários de produção podem resetar pedidos.'}), 403

    data = request.get_json()
    order_id = data.get('order_id')
    if not order_id:
        return jsonify({'success': False, 'message': 'ID do pedido inválido.'}), 400

    conn = get_producao_ml_db()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, checked FROM pedidos WHERE id = ? AND checked = 1", (order_id,))
        order = cursor.fetchone()
        if not order:
            print(f'[Server] Pedido ID {order_id} não encontrado ou não está checkado.')
            return jsonify({'success': False, 'message': 'Pedido não encontrado ou não está checkado.'}), 404

        cursor.execute("UPDATE pedidos SET checked = 0, checked_date = NULL, producao = '' WHERE id = ?", (order_id,))
        conn.commit()
        print(f'[Server] Pedido resetado: ID={order_id}')
        return jsonify({'success': True, 'message': f'Pedido ID {order_id} resetado com sucesso.'})
    except sqlite3.Error as e:
        conn.rollback()
        print(f'[Server] Erro ao resetar pedido ID {order_id}: {str(e)}')
        return jsonify({'success': False, 'message': f'Erro ao resetar pedido: {str(e)}'}), 500
    finally:
        conn.close()







#SHOPEE PRODUCAO
def determine_section(sku):
    """Determina a seção com base no SKU."""
    if not sku:
        return 'Desconhecido'
    sku = sku.upper()
    if sku == 'EX-130':
        return 'EX130'
    elif sku.startswith('-999') or sku.startswith('-100') or sku.startswith('-VF'):
        return 'PV-ESPECIAL'
    elif sku.startswith('PR'):
        return 'PR'
    elif sku.startswith('PV'):
        return 'PV'
    elif sku.startswith('FF'):
        return 'FF'
    elif sku.startswith('PCR'):
        return 'PCR'
    return 'Outros'  # Seção padrão para SKUs não mapeados

def extract_shopee_orders_producao(text):
    if not text or not isinstance(text, str):
        logger.error(f"[Server] Texto inválido recebido: {text}")
        return [], []

    orders = []
    invalid_orders = []
    lines = text.strip().splitlines()
    order_id = None
    order_status = 'pendente'
    total_products = None
    total_items = None
    current_quantity = 1

    logger.info(f"[Server] Processando {len(lines)} linhas de texto")
    current_skus = []

    for line in lines:
        line = line.strip()
        if not line:
            continue

        if line.startswith("ID do Pedido"):
            # Salvar pedidos anteriores
            if order_id and current_skus:
                if total_products is not None and total_items is not None and total_products != total_items:
                    invalid_orders.append({
                        'order_id': order_id,
                        'error': f'Quantidade de produtos ({total_products}) não coincide com itens ({total_items})'
                    })
                else:
                    for sku_info in current_skus:
                        orders.append({
                            'order_id': order_id,
                            'sku': sku_info['sku'],
                            'quantity': sku_info['quantity'],
                            'status': order_status,
                            'date_created': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                        })

            # Iniciar novo pedido
            order_id = line.replace("ID do Pedido", "").strip()
            order_status = 'pendente'
            total_products = None
            total_items = None
            current_skus = []
            logger.debug(f"[Server] Novo order_id: {order_id}")

        elif line in ["A Enviar", "Coleta", "Postagem / Coleta"]:
            order_status = 'coleta' if line != "A Enviar" else 'pendente'

        elif line.startswith('x'):
            try:
                current_quantity = int(line.replace('x', '').strip())
            except:
                current_quantity = 1

        elif '[' in line and ']' in line:
            match = re.search(r'\[(.*?)\]', line)
            if match:
                sku_list = match.group(1).strip().split()
                selected_sku = None

                if len(sku_list) == 1:
                    selected_sku = sku_list[0]
                elif len(sku_list) >= 2:
                    selected_sku = sku_list[1]

                if selected_sku:
                    selected_sku = selected_sku.upper().strip()
                    for suffix in ['-P', '-V', '-F', '-150']:
                        if selected_sku.endswith(suffix):
                            selected_sku = selected_sku[:-len(suffix)]
                    current_skus.append({
                        'sku': selected_sku,
                        'quantity': current_quantity
                    })
                    logger.debug(f"[Server] SKU selecionado: {selected_sku} x{current_quantity}")
                current_quantity = 1  # Resetar após usar

        elif re.match(r'Total de (\d+) produtos \( (\d+) itens \)', line):
            match = re.match(r'Total de (\d+) produtos \( (\d+) itens \)', line)
            total_products = int(match.group(1))
            total_items = int(match.group(2))

    # Último pedido
    if order_id and current_skus:
        if total_products is not None and total_items is not None and total_products != total_items:
            invalid_orders.append({
                'order_id': order_id,
                'error': f'Quantidade de produtos ({total_products}) não coincide com itens ({total_items})'
            })
        else:
            for sku_info in current_skus:
                orders.append({
                    'order_id': order_id,
                    'sku': sku_info['sku'],
                    'quantity': sku_info['quantity'],
                    'status': order_status,
                    'date_created': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                })

    logger.info(f"[Server] Extraídos {len(orders)} pedidos válidos e {len(invalid_orders)} pedidos inválidos")
    return orders, invalid_orders


def get_producao_shopee_db():
    try:
        conn = sqlite3.connect('producao_shp.db')
        cursor = conn.cursor()

        # Cria a tabela pedidos_shopee se não existir, sem restrição NOT NULL em sku
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS pedidos_shopee (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id TEXT NOT NULL,
                sku TEXT,  -- Sem restrição NOT NULL
                status TEXT,
                checked INTEGER DEFAULT 0,
                checked_date TEXT,
                producao TEXT,
                quantity INTEGER DEFAULT 1,
                date_created TEXT,
                error TEXT,
                UNIQUE(order_id, sku)
            )
        """)
        conn.commit()

        # Verifica e adiciona colunas ausentes, se necessário
        cursor.execute("PRAGMA table_info(pedidos_shopee)")
        columns = [col[1] for col in cursor.fetchall()]
        
        # Adiciona coluna 'checked' se não existir
        if 'checked' not in columns:
            try:
                cursor.execute("ALTER TABLE pedidos_shopee ADD COLUMN checked INTEGER DEFAULT 0")
                conn.commit()
                logger.info("[Server] Coluna 'checked' adicionada à tabela pedidos_shopee")
            except sqlite3.Error as e:
                logger.error(f"[Server] Erro ao adicionar coluna 'checked': {str(e)}")
                conn.rollback()
                raise
        
        # Adiciona coluna 'error' se não existir
        if 'error' not in columns:
            try:
                cursor.execute("ALTER TABLE pedidos_shopee ADD COLUMN error TEXT")
                conn.commit()
                logger.info("[Server] Coluna 'error' adicionada à tabela pedidos_shopee")
            except sqlite3.Error as e:
                logger.error(f"[Server] Erro ao adicionar coluna 'error': {str(e)}")
                conn.rollback()
                raise
        
        # Adiciona coluna 'quantity' se não existir
        if 'quantity' not in columns:
            try:
                cursor.execute("ALTER TABLE pedidos_shopee ADD COLUMN quantity INTEGER DEFAULT 1")
                conn.commit()
                logger.info("[Server] Coluna 'quantity' adicionada à tabela pedidos_shopee")
            except sqlite3.Error as e:
                logger.error(f"[Server] Erro ao adicionar coluna 'quantity': {str(e)}")
                conn.rollback()
                raise
        
        # Adiciona coluna 'date_created' se não existir
        if 'date_created' not in columns:
            try:
                cursor.execute("ALTER TABLE pedidos_shopee ADD COLUMN date_created TEXT")
                conn.commit()
                logger.info("[Server] Coluna 'date_created' adicionada à tabela pedidos_shopee")
            except sqlite3.Error as e:
                logger.error(f"[Server] Erro ao adicionar coluna 'date_created': {str(e)}")
                conn.rollback()
                raise

        # Cria a tabela shopee_info se não existir
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS shopee_info (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                coleta_info TEXT NOT NULL,
                saved_date TEXT NOT NULL,
                user_id TEXT NOT NULL
            )
        """)
        conn.commit()
        logger.info("[Server] Tabela shopee_info verificada/criada com sucesso")

        conn.row_factory = sqlite3.Row
        return conn

    except sqlite3.Error as e:
        logger.error(f"[Server] Erro ao conectar ou configurar o banco de dados: {str(e)}")
        if 'conn' in locals():
            conn.close()
        raise

def extract_orders_shopee(text):
    orders = []
    lines = text.splitlines()
    current_order_id = None

    for line in lines:
        if "ID do Pedido" in line:
            match = re.search(r"ID do Pedido\s+(\w+)", line)
            if match:
                current_order_id = match.group(1)
        elif "Variação:" in line and "[" in line and "]" in line and current_order_id:
            sku_match = re.search(r"\[(.*?)\]", line)
            if sku_match:
                skus = sku_match.group(1).split()
                for sku in skus:
                    orders.append({
                        'order_id': current_order_id,
                        'sku': sku.strip().upper(),
                        'status': 'pendente'
                    })
    return orders




@app.route('/process_orders_shopee_producao', methods=['POST'])
@login_required
def process_orders_shopee_producao():
    if current_user.role != 'producao':
        return jsonify({'success': False, 'message': 'Acesso negado.'}), 403

    try:
        data = request.form.get('orders', '').strip()
        if not data:
            return jsonify({
                'success': False,
                'message': 'Nenhum dado de pedido fornecido.',
                'inserted_orders': [],
                'nao_processados': [],
                'active_tab': 'shopee-tab'
            }), 200

        orders, invalid_orders = extract_shopee_orders_producao(data)
        if not orders and not invalid_orders:
            return jsonify({
                'success': False,
                'message': 'Nenhum pedido válido ou inválido encontrado.',
                'inserted_orders': [],
                'nao_processados': [],
                'active_tab': 'shopee-tab'
            }), 200

        conn = get_producao_shopee_db()
        cursor = conn.cursor()

        pedidos_nao_processados = []
        inserted_orders = []

        for order in orders:
            order_id = order.get('order_id')
            sku = order.get('sku')
            quantity = order.get('quantity', 1)
            status = order.get('status', 'pendente')
            date_created = order.get('date_created', datetime.now().strftime('%Y-%m-%d %H:%M:%S'))

            if not order_id or not sku:
                pedidos_nao_processados.append({
                    'order_id': order_id or 'Desconhecido',
                    'error': 'ID ou SKU ausente'
                })
                logger.error(f"[Server] Pedido inválido: Order_ID={order_id}, SKU={sku}")
                continue

            cursor.execute("SELECT id FROM pedidos_shopee WHERE order_id = ? AND sku = ?", (order_id, sku))
            existente = cursor.fetchone()
            if existente:
                pedidos_nao_processados.append({
                    'order_id': order_id,
                    'error': f'Pedido já processado com SKU {sku}'
                })
                logger.info(f"[Server] Ignorando pedido duplicado: Order_ID={order_id}, SKU={sku}")
                continue

            try:
                section = determine_section(sku)
                cursor.execute("""
                    INSERT INTO pedidos_shopee (order_id, sku, checked, status, date_created, quantity, producao)
                    VALUES (?, ?, 0, ?, ?, ?, ?)
                """, (order_id, sku, status, date_created, quantity, section))
                cursor.execute("SELECT last_insert_rowid()")
                order_id_db = cursor.fetchone()[0]
                inserted_orders.append({
                    'id': order_id_db,
                    'order_id': order_id,
                    'sku': sku,
                    'quantity': quantity,
                    'status': status,
                    'producao': section
                })
                logger.info(f"[Server] Pedido válido inserido: ID={order_id_db}, Order_ID={order_id}, SKU={sku}, Seção={section}")
            except sqlite3.Error as e:
                logger.error(f"[Server] Erro ao inserir pedido {order_id}, SKU {sku}: {str(e)}")
                pedidos_nao_processados.append({
                    'order_id': order_id,
                    'error': f'Erro ao inserir: {str(e)}'
                })

        for invalid_order in invalid_orders:
            order_id = invalid_order.get('order_id')
            error_msg = invalid_order.get('error', 'Erro desconhecido')

            if not order_id:
                pedidos_nao_processados.append({
                    'order_id': 'Desconhecido',
                    'error': error_msg
                })
                logger.error(f"[Server] Pedido inválido sem Order_ID: Error={error_msg}")
                continue

            cursor.execute("SELECT id FROM pedidos_shopee WHERE order_id = ? AND sku IS NULL AND checked = 0", (order_id,))
            existing_invalid = cursor.fetchone()
            if existing_invalid:
                try:
                    cursor.execute("""
                        UPDATE pedidos_shopee
                        SET status = 'inválido', error = ?, date_created = ?
                        WHERE id = ?
                    """, (error_msg, datetime.now().strftime('%Y-%m-%d %H:%M:%S'), existing_invalid[0]))
                    pedidos_nao_processados.append({
                        'order_id': order_id,
                        'error': error_msg
                    })
                    logger.info(f"[Server] Pedido inválido atualizado: Order_ID={order_id}, Error={error_msg}")
                except sqlite3.Error as e:
                    logger.error(f"[Server] Erro ao atualizar pedido inválido {order_id}: {str(e)}")
                    pedidos_nao_processados.append({
                        'order_id': order_id,
                        'error': f'Erro ao atualizar: {str(e)}'
                    })
            else:
                try:
                    cursor.execute("""
                        INSERT INTO pedidos_shopee (order_id, sku, checked, status, error, date_created, quantity)
                        VALUES (?, NULL, 0, 'inválido', ?, ?, 1)
                    """, (order_id, error_msg, datetime.now().strftime('%Y-%m-%d %H:%M:%S')))
                    pedidos_nao_processados.append({
                        'order_id': order_id,
                        'error': error_msg
                    })
                    logger.info(f"[Server] Pedido inválido inserido: Order_ID={order_id}, Error={error_msg}")
                except sqlite3.Error as e:
                    logger.error(f"[Server] Erro ao inserir pedido inválido {order_id}: {str(e)}")
                    pedidos_nao_processados.append({
                        'order_id': order_id,
                        'error': f'Erro ao inserir: {str(e)}'
                    })

        conn.commit()
        conn.close()

        return jsonify({
            'success': True,
            'message': f'{len(inserted_orders)} pedido(s) processado(s) com sucesso.',
            'inserted_orders': inserted_orders,
            'nao_processados': pedidos_nao_processados,
            'active_tab': 'shopee-tab',
            'reload': True
        })

    except Exception as e:
        if 'conn' in locals():
            conn.close()
        logger.error(f"[Server] Erro geral ao processar pedidos Shopee: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Erro ao processar pedidos: {str(e)}',
            'inserted_orders': [],
            'nao_processados': pedidos_nao_processados if 'pedidos_nao_processados' in locals() else [],
            'active_tab': 'shopee-tab',
            'reload': False
        }), 500
        
@app.route('/get_orders_shopee', methods=['GET'])
@login_required
def get_orders_shopee():
    if current_user.role != 'producao':
        return jsonify(success=False, message="Acesso negado."), 403

    conn = get_producao_shopee_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM pedidos_shopee WHERE checked = 0")
    rows = cursor.fetchall()

    sections = {}
    for row in rows:
        sku = row['sku'].upper()

        if sku == 'EX-130':
            key = 'EX130'
        elif sku.startswith('-999') or sku.startswith('-100') or sku.startswith('-VF'):
            key = 'PV-ESPECIAL'
        else:
            key = sku[:2]  # mantém agrupamento padrão pelo prefixo

        if key not in sections:
            sections[key] = []

        sections[key].append({
            'id': row['id'],
            'order_id': row['order_id'],
            'sku': row['sku'],
            'status': row['status']
        })


    return jsonify(success=True, sections=sections)

@app.route('/check_orders_shopee2', methods=['POST'])
@login_required
def check_orders_shopee2():
    if current_user.role != 'producao':
        return jsonify(success=False, message="Acesso negado."), 403

    data = request.get_json()
    order_ids = data.get("order_ids", [])
    action = data.get("action", "check")

    if not order_ids:
        return jsonify(success=False, message="Nenhum ID fornecido."), 400

    producao_status = "Estoque" if action == "estoque" else "Costura"
    conn = get_producao_shopee_db()
    cursor = conn.cursor()

    for oid in order_ids:
        cursor.execute("""
            UPDATE pedidos_shopee
            SET checked = 1, checked_date = ?, producao = ?
            WHERE id = ?
        """, (datetime.now().strftime("%d/%m/%Y %H:%M:%S"), producao_status, oid))

    conn.commit()
    conn.close()
    return jsonify(success=True, message=f"{len(order_ids)} pedidos marcados como {producao_status}.", reload=True)

@app.route('/reset_order_shopee', methods=['POST'])
@login_required
def reset_order_shopee():
    if current_user.role != 'producao':
        return jsonify(success=False, message="Acesso negado."), 403

    data = request.get_json()
    order_id = data.get('order_id')
    if not order_id:
        return jsonify(success=False, message="ID do pedido inválido."), 400

    try:
        conn = get_producao_shopee_db()
        cursor = conn.cursor()

        # Busca o SKU do pedido usando order_id em vez de id
        cursor.execute("SELECT sku FROM pedidos_shopee WHERE order_id = ?", (order_id,))
        result = cursor.fetchone()
        if not result:
            conn.close()
            return jsonify(success=False, message="Pedido não encontrado."), 404

        sku = result[0]
        section = determine_section(sku)  # Determina a seção com base no SKU

        # Atualiza o pedido para redefinir checked, checked_date e seta a seção correta
        cursor.execute("""
            UPDATE pedidos_shopee
            SET checked = 0, checked_date = NULL, producao = ?
            WHERE order_id = ?
        """, (section, order_id))

        conn.commit()
        conn.close()

        return jsonify({
            'success': True,
            'message': 'Pedido resetado com sucesso.',
            'reload': True,
            'active_tab': 'shopee-tab'
        })

    except Exception as e:
        conn.close()
        return jsonify({
            'success': False,
            'reload': True,
            'message': f"Erro ao resetar pedido: {str(e)}"
            
        }), 500


@app.route('/get_checked_orders_shopee', methods=['GET'])
@login_required
def get_checked_orders_shopee():
    if current_user.role != 'producao':
        return jsonify(success=False, message="Acesso negado."), 403

    try:
        conn = get_producao_shopee_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT order_id, sku, status, checked_date, producao
            FROM pedidos_shopee
            WHERE checked = 1
            ORDER BY checked_date DESC
        """)
        rows = cursor.fetchall()

        pedidos = []
        for row in rows:
            pedidos.append({
                'pedido': row['order_id'],
                'sku': row['sku'],
                'status': row['status'],
                'data_check': row['checked_date'],
                'producao': row['producao']
            })

        conn.close()

        return jsonify({
            'success': True,
            'orders': pedidos
        })

    except Exception as e:
        conn.close()
        return jsonify({
            'success': False,
            'message': f"Erro ao carregar histórico: {str(e)}"
        }), 500

@app.route('/delete_invalid_order_shopee2', methods=['POST'])
@login_required
def delete_invalid_order_shopee2():
    if current_user.role != 'producao':
        return jsonify(success=False, message="Acesso negado."), 403

    data = request.get_json()
    order_id = data.get('order_id')

    if not order_id:
        return jsonify(success=False, message="ID inválido."), 400

    conn = get_producao_shopee_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM pedidos_shopee WHERE order_id = ? AND (sku IS NULL OR sku = '')", (order_id,))
    conn.commit()
    return jsonify(success=True, message="Pedido inválido deletado com sucesso.")



@app.route('/save_info_shopee', methods=['POST'])
@login_required
def save_info_shopee():
    if current_user.role != 'producao':
        logger.warning(f"[Server] Acesso negado para usuário {current_user.id} na rota /save_info_shopee")
        return jsonify({'success': False, 'message': 'Acesso negado.'}), 403

    try:
        coleta_shopee = request.form.get('coleta_shopee', '').strip()
        if not coleta_shopee:
            logger.warning("[Server] Nenhum valor fornecido para coleta_shopee")
            return jsonify({'success': False, 'message': 'O campo SHOPEE TOTAL é obrigatório.'}), 400

        # Valida se o valor é um número
        try:
            coleta_shopee = int(coleta_shopee)
            if coleta_shopee < 0:
                logger.warning("[Server] Valor inválido para coleta_shopee: valor negativo")
                return jsonify({'success': False, 'message': 'O valor de SHOPEE TOTAL deve ser um número não negativo.'}), 400
        except ValueError:
            logger.warning("[Server] Valor inválido para coleta_shopee: não é um número")
            return jsonify({'success': False, 'message': 'O valor de SHOPEE TOTAL deve ser um número.'}), 400

        conn = get_producao_shopee_db()
        cursor = conn.cursor()

        # Verifica se a tabela existe
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='shopee_info'")
        if not cursor.fetchone():
            logger.error("[Server] Tabela shopee_info não encontrada após tentativa de criação")
            conn.close()
            return jsonify({'success': False, 'message': 'Erro interno: tabela shopee_info não encontrada.'}), 500

        # Insere os dados
        cursor.execute("""
            INSERT INTO shopee_info (coleta_info, saved_date, user_id)
            VALUES (?, ?, ?)
        """, (str(coleta_shopee), datetime.now().strftime('%Y-%m-%d %H:%M:%S'), str(current_user.id)))
        conn.commit()
        logger.info(f"[Server] Informações Shopee salvas pelo usuário {current_user.id}: coleta_shopee={coleta_shopee}")

        conn.close()
        return jsonify({'success': True, 'message': 'Informações Shopee salvas com sucesso.'})

    except sqlite3.Error as e:
        logger.error(f"[Server] Erro ao salvar informações Shopee: {str(e)}")
        if 'conn' in locals():
            conn.close()
        return jsonify({'success': False, 'message': f'Erro ao salvar informações: {str(e)}'}), 500
    except Exception as e:
        logger.error(f"[Server] Erro geral ao salvar informações Shopee: {str(e)}")
        if 'conn' in locals():
            conn.close()
        return jsonify({'success': False, 'message': f'Erro ao salvar informações: {str(e)}'}), 500

















    
    
    
            
        # Iniciar limpeza periódica
def start_cleanup_thread():
    while True:
        cleanup_old_temp_folders()
        time.sleep(60000)  # Verifica a cada 360 minutos  

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



