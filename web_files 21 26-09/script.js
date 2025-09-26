
// =================================================================================
// DADOS E ESTADO INICIAL
// =================================================================================
let users = [];
let currentUser = null;
let itensEstoque = [];
let pedidos = [];
let images = [];
let producao = [];
let costura = [];
let expedicao = [];
let logs = [];
let charts = {};
let transacoesFiltradasGlobal = [];
let transacoesPaginaAtual = 1;
let relatoriosArquivados = [];
let pedidosComErro = [];
let impressoraSelecionada = null;
let historicoPaginaAtual = 1;
let itensParaProducaoGlobal = [];
let historicoArtes = []; // NOVO: Array para o histórico de artes enviadas
const HISTORICO_ITENS_POR_PAGINA = 200;
let tarefaCosturaAtiva = null; // Guarda a tarefa de costura em andamento
let cronometroCosturaInterval = null; // Guarda o intervalo do cronômetro
let tempoPausadoAcumulado = 0; // Guarda o tempo total que a tarefa ficou pausada
let conversas = []; // <-- SUBSTITUA 'notificacoes' POR 'conversas'
let listaEANs = []; 
let lojaSelecionada = null;
let itemParaEditarId = null;


const CAMINHO_IMAGEM_TESTE = "img/VCAB001.jpg";

const TRANSACOES_POR_PAGINA = 50;

const ESTOQUE_BAIXO_THRESHOLD = 10; // Alerta quando a quantidade for <= 10

// Estrutura de permissões padrão para novos usuários
const defaultPermissions = {
    estoque: { visualizar: false, cadastrar: false, editar: false, excluir: false, movimentar: false },
    pedidos: { visualizar: false, importar: false, editar: false, excluir: false, cadastrar: false },
    bancoImagens: { visualizar: false, adicionar: false, excluir: false },
    producao: { visualizar: false, adicionar: false, editar: false, excluir: false },
    costura: { visualizar: false, adicionar: false, editar: false, excluir: false },
    expedicao: { visualizar: false, adicionar: false, editar: false, excluir: false },
    chat: { visualizar: true, enviar: false }, // <-- SUBSTITUA 'notificacoes' POR 'chat'
    processadorEANs: { visualizar: false, processar: false } 


};


// =================================================================================
// FUNÇÃO DE EXCLUSÃO TOTAL DE DADOS (ZONA DE PERIGO)
// =================================================================================

/**
 * Inicia o processo de exclusão de TODOS os dados do sistema.
 * Requer múltiplas confirmações para segurança.
 */
function deleteAllSystemData() {
    // 1. Primeira camada de segurança: Permissão de Admin Master
    if (currentUser.role !== 'admin-master') {
        showToast('Apenas o administrador mestre pode executar esta ação.', 'error');
        return;
    }

    // 2. Segunda camada de segurança: Confirmação inicial
    if (!confirm("ATENÇÃO: VOCÊ ESTÁ PRESTES A DELETAR TODOS OS DADOS DO SISTEMA. Esta ação não pode ser desfeita. Deseja continuar?")) {
        showToast('Operação cancelada.', 'info');
        return;
    }

    // 3. Terceira camada de segurança: Confirmação por digitação
    const confirmationText = "EXCLUIR TUDO AGORA";
    const userInput = prompt(`Esta é sua última chance. Para confirmar a exclusão permanente de todos os dados, digite a frase exatamente como abaixo:\n\n${confirmationText}`);

    if (userInput !== confirmationText) {
        showToast('A frase de confirmação não corresponde. Operação cancelada.', 'error');
        return;
    }

    // 4. Execução da Exclusão
    try {
        // Limpa todos os arrays de dados em memória
        users = [];
        itensEstoque = [];
        pedidos = [];
        images = [];
        producao = [];
        costura = [];
        expedicao = [];
        logs = [];
        historicoArtes = [];
        transacoesEstoque = [];
        relatoriosArquivados = [];
        pedidosComErro = [];

        // Limpa completamente o localStorage
        localStorage.clear();

        // Feedback final e logout forçado
        alert('Todos os dados do sistema foram excluídos com sucesso. O sistema será reiniciado.');
        
        // Força o logout e o recarregamento da página para um estado limpo
        currentUser = null;
        window.location.reload();

    } catch (error) {
        console.error("Erro ao tentar excluir todos os dados:", error);
        showToast('Ocorreu um erro inesperado durante a exclusão.', 'error');
    }
}




/**
 * Exclui todos os dados relacionados ao módulo de Pedidos (PF),
 * incluindo pedidos pendentes, processados e com erro.
 * Esta função requer confirmação do usuário antes de prosseguir.
 */
function excluirDadosModuloPF() {
    // 1. Verifica se o usuário tem a permissão necessária (admin-master).
    // Apenas administradores mestres devem poder executar uma ação tão destrutiva.
    if (currentUser.role !== 'admin-master') {
        showToast('Apenas administradores mestres podem executar esta ação.', 'error');
        return;
    }

    // 2. Pede uma confirmação explícita ao usuário.
    // Isso previne a exclusão acidental de todos os dados de pedidos.
    const confirmacao = prompt("ATENÇÃO: Esta ação excluirá TODOS os pedidos (pendentes, processados, com erro) e não pode ser desfeita. Digite 'EXCLUIR TUDO' para confirmar.");

    // 3. Verifica se a confirmação foi digitada corretamente.
    if (confirmacao === 'EXCLUIR TUDO') {
        // 4. Limpa as variáveis de dados do módulo de pedidos.
        pedidos = [];
        pedidosComErro = [];

        // 5. Salva o estado vazio no localStorage para persistir a exclusão.
        saveData();

        // 6. Recarrega a visualização do módulo de pedidos para refletir a limpeza.
        // A tela ficará vazia.
        loadPedidos();

        // 7. Registra a ação no log do sistema para auditoria.
        const logMessage = 'Todos os dados do módulo de Pedidos foram excluídos.';
        logAction(logMessage);

        // 8. Exibe uma notificação de sucesso para o usuário.
        showToast(logMessage, 'success');
    } else {
        // 9. Se a confirmação falhar, informa o usuário que a operação foi cancelada.
        showToast('Operação cancelada. A confirmação não foi digitada corretamente.', 'info');
    }
}






// =================================================================================
// FUNÇÕES DE UTILIDADE (DADOS E LOGS)
// =================================================================================
function saveData() {
    localStorage.setItem('saas_users', JSON.stringify(users));
    localStorage.setItem('saas_currentUser', JSON.stringify(currentUser));
    localStorage.setItem('saas_itensEstoque', JSON.stringify(itensEstoque));
    localStorage.setItem('saas_pedidos', JSON.stringify(pedidos));
    localStorage.setItem('saas_images', JSON.stringify(images));
    localStorage.setItem('saas_producao', JSON.stringify(producao));
    localStorage.setItem('saas_costura', JSON.stringify(costura));
    localStorage.setItem('saas_expedicao', JSON.stringify(expedicao));
    localStorage.setItem('saas_logs', JSON.stringify(logs));
    localStorage.setItem('saas_transacoesEstoque', JSON.stringify(transacoesEstoque)); // GARANTIR QUE ESTA LINHA EXISTA
        localStorage.setItem('saas_relatoriosArquivados', JSON.stringify(relatoriosArquivados));
        localStorage.setItem('saas_historicoArtes', JSON.stringify(historicoArtes)); // ADICIONE ESTA LINHA
        localStorage.setItem('saas_pedidosComErro', JSON.stringify(pedidosComErro));
    localStorage.setItem('saas_conversas', JSON.stringify(conversas)); // <-- ATUALIZE AQUI
        localStorage.setItem('saas_listaEANs', JSON.stringify(listaEANs));


}

function loadData() {
    const storedUsers = localStorage.getItem('saas_users');
    if (!storedUsers || JSON.parse(storedUsers).length === 0) {
        // Adiciona usuários padrão se não houver nenhum
        users = [
            {
                username: 'admin',
                password: 'admin',
                role: 'admin-master',
                permissions: { all: true } // Permissão total para o admin master
            },
            {
                username: 'user1',
                password: 'user',
                role: 'user',
                permissions: {
                    ...defaultPermissions,
                    estoque: { visualizar: true, cadastrar: true, editar: true, excluir: true, movimentar: true },
                    pedidos: { visualizar: true, importar: false, editar: false, excluir: false, cadastrar: true }
                }
            }
        ];
    } else {
        users = JSON.parse(storedUsers);
    }

    // Garante que todos os itens tenham um status
    itensEstoque.forEach(item => {
        if (!item.status) {
            item.status = 'Disponível';
        }
    });

    currentUser = JSON.parse(localStorage.getItem('saas_currentUser')) || null;
    itensEstoque = JSON.parse(localStorage.getItem('saas_itensEstoque')) || [];
    pedidos = JSON.parse(localStorage.getItem('saas_pedidos')) || [];
    images = JSON.parse(localStorage.getItem('saas_images')) || [];
    producao = JSON.parse(localStorage.getItem('saas_producao')) || [];
    costura = JSON.parse(localStorage.getItem('saas_costura')) || [];
    expedicao = JSON.parse(localStorage.getItem('saas_expedicao')) || [];
    logs = JSON.parse(localStorage.getItem('saas_logs')) || [];
        historicoArtes = JSON.parse(localStorage.getItem('saas_historicoArtes')) || []; // ADICIONE ESTA LINHA
    conversas = JSON.parse(localStorage.getItem('saas_conversas')) || []; // <-- ATUALIZE AQUI
    listaEANs = JSON.parse(localStorage.getItem('saas_listaEANs')) || [];


    transacoesEstoque = JSON.parse(localStorage.getItem('saas_transacoesEstoque')) || []; // GARANTIR QUE ESTA LINHA EXISTA
        relatoriosArquivados = JSON.parse(localStorage.getItem('saas_relatoriosArquivados')) || [];
    pedidosComErro = JSON.parse(localStorage.getItem('saas_pedidosComErro')) || [];

}


// NOVO: Função para notificações visuais (Toast)
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toastId = `toast-${Date.now()}`;
    
    const colors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        info: 'bg-blue-500'
    };
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        info: 'fa-info-circle'
    };

    const toastHtml = `
        <div id="${toastId}" class="flex items-center p-4 rounded-xl shadow-lg text-white ${colors[type]} transform translate-x-full opacity-0 transition-all duration-300 ease-out">
            <i class="fas ${icons[type]} text-xl mr-3"></i>
            <span>${message}</span>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', toastHtml);

    const toastElement = document.getElementById(toastId);
    
    // Animação de entrada
    setTimeout(() => {
        toastElement.classList.remove('translate-x-full', 'opacity-0');
    }, 100);

    // Animação de saída
    setTimeout(() => {
        toastElement.classList.add('opacity-0', 'translate-x-full');
        setTimeout(() => toastElement.remove(), 300);
    }, 4000); // A notificação some após 4 segundos
}

/**
 * Registra uma ação detalhada no log do sistema. (VERSÃO BLINDADA E INTELIGENTE)
 * Esta função agora aceita tanto uma string (formato antigo) quanto um objeto (formato novo).
 * @param {object|string} logData - Um objeto com detalhes do log ou uma string simples.
 */
function logAction(logData) {
    const usuario = currentUser ? currentUser.username : 'Sistema';
    let novoLog;

    // VERIFICA SE A CHAMADA É NO FORMATO NOVO (OBJETO) OU ANTIGO (STRING)
    if (typeof logData === 'object' && logData !== null) {
        // Formato NOVO (objeto) - ideal
        novoLog = {
            id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            usuario: usuario,
            ...logData
        };
    } else {
        // Formato ANTIGO (string) - cria um objeto básico para compatibilidade
        novoLog = {
            id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            usuario: usuario,
            acao: String(logData), // Garante que a ação seja uma string
            modulo: 'N/A (Legado)', // Marca como log antigo
            funcao: 'N/A',
            detalhes: { info: 'Log em formato antigo.' }
        };
    }

    logs.unshift(novoLog);

    // Limita o tamanho do array de logs
    if (logs.length > 50000) {
        logs.pop();
    }

    saveData();
    // Atualiza a UI se a tela de logs estiver visível
    if (document.getElementById('system-logs') && !document.getElementById('system-logs').classList.contains('hidden')) {
        renderSystemLogs();
    }
}





// Variáveis globais para controle da paginação dos logs
let logsPaginaAtual = 1;
const LOGS_POR_PAGINA = 100;

/**
 * Função principal para renderizar a tela de Logs do Sistema.
 * Aplica filtros, paginação e desenha a tabela.
 */
function renderSystemLogs() {
    const tbody = document.getElementById('system-logs-tbody');
    if (!tbody) return;

    // 1. Pega os valores dos filtros
    const filtroUsuario = document.getElementById('log-filter-usuario').value.toLowerCase();
    const filtroModulo = document.getElementById('log-filter-modulo').value;
    const filtroDataInicio = document.getElementById('log-filter-data-inicio').value;
    const filtroDataFim = document.getElementById('log-filter-data-fim').value;

    // 2. Filtra o array 'logs'
    const logsFiltrados = logs.filter(log => {
        if (!log || typeof log !== 'object') return false; // Ignora logs no formato antigo (string)

        const dataLog = new Date(log.timestamp);
        const dataInicio = filtroDataInicio ? new Date(filtroDataInicio) : null;
        const dataFim = filtroDataFim ? new Date(filtroDataFim) : null;

        if (dataInicio) dataInicio.setHours(0, 0, 0, 0);
        if (dataFim) dataFim.setHours(23, 59, 59, 999);

        const usuarioMatch = !filtroUsuario || log.usuario.toLowerCase().includes(filtroUsuario);
        const moduloMatch = !filtroModulo || log.modulo === filtroModulo;
        const dataMatch = (!dataInicio || dataLog >= dataInicio) && (!dataFim || dataLog <= dataFim);

        return usuarioMatch && moduloMatch && dataMatch;
    });

    // 3. Lógica de Paginação
    const totalLogs = logsFiltrados.length;
    const totalPaginas = Math.ceil(totalLogs / LOGS_POR_PAGINA) || 1;
    if (logsPaginaAtual > totalPaginas) logsPaginaAtual = totalPaginas;

    const inicio = (logsPaginaAtual - 1) * LOGS_POR_PAGINA;
    const fim = inicio + LOGS_POR_PAGINA;
    const logsDaPagina = logsFiltrados.slice(inicio, fim);

    // 4. Renderiza as linhas da tabela
    if (logsDaPagina.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center p-8 text-gray-500">Nenhum registro encontrado com os filtros aplicados.</td></tr>`;
    } else {
        tbody.innerHTML = logsDaPagina.map(log => {
            const { icon, color } = getLogVisuals(log.acao);
            
            // Formata os detalhes para exibição
            let detalhesHtml = '-';
            if (log.detalhes && Object.keys(log.detalhes).length > 0) {
                detalhesHtml = Object.entries(log.detalhes)
                    .map(([key, value]) => `<strong>${key}:</strong> ${value}`)
                    .join(', ');
            }

            return `
                <tr class="border-b hover:bg-gray-50">
                    <td class="p-3 text-xs text-gray-600">${new Date(log.timestamp).toLocaleString('pt-BR')}</td>
                    <td class="p-3 text-sm font-semibold text-gray-800">${log.usuario}</td>
                    <td class="p-3 text-sm">${log.modulo || 'N/A'}</td>
                    <td class="p-3 text-sm flex items-center gap-2 ${color}">
                        <i class="fas ${icon}"></i>
                        <span>${log.acao}</span>
                    </td>
                    <td class="p-3 text-xs text-gray-500 font-mono" title="${detalhesHtml}">${detalhesHtml}</td>
                </tr>
            `;
        }).join('');
    }

    // 5. Renderiza os controles de paginação
    renderLogPagination(totalPaginas, totalLogs);
}

/**
 * Retorna um ícone e uma cor com base no tipo de ação do log.
 * @param {string} acao - A descrição da ação.
 * @returns {{icon: string, color: string}}
 */
function getLogVisuals(acao = '') {
    const lowerAcao = acao.toLowerCase();
    if (lowerAcao.includes('criado') || lowerAcao.includes('adicionado') || lowerAcao.includes('importado') || lowerAcao.includes('cadastrado')) {
        return { icon: 'fa-plus-circle', color: 'text-green-600' };
    }
    if (lowerAcao.includes('excluído') || lowerAcao.includes('removido') || lowerAcao.includes('limpo')) {
        return { icon: 'fa-trash-alt', color: 'text-red-600' };
    }
    if (lowerAcao.includes('editado') || lowerAcao.includes('alterado') || lowerAcao.includes('atualizado') || lowerAcao.includes('salvas')) {
        return { icon: 'fa-pencil-alt', color: 'text-blue-600' };
    }
    if (lowerAcao.includes('movido') || lowerAcao.includes('enviado')) {
        return { icon: 'fa-arrow-right', color: 'text-purple-600' };
    }
    if (lowerAcao.includes('login') || lowerAcao.includes('logout')) {
        return { icon: 'fa-sign-in-alt', color: 'text-gray-700' };
    }
    if (lowerAcao.includes('falhou') || lowerAcao.includes('erro')) {
        return { icon: 'fa-exclamation-triangle', color: 'text-orange-500' };
    }
    return { icon: 'fa-info-circle', color: 'text-gray-500' }; // Padrão
}

/**
 * Renderiza os controles de paginação para a tabela de logs.
 * @param {number} totalPaginas - O número total de páginas.
 * @param {number} totalLogs - O número total de logs filtrados.
 */
function renderLogPagination(totalPaginas, totalLogs) {
    const controlsContainer = document.getElementById('log-pagination-controls');
    const infoContainer = document.getElementById('log-pagination-info');
    if (!controlsContainer || !infoContainer) return;

    if (totalLogs > 0) {
        infoContainer.innerText = `Página ${logsPaginaAtual} de ${totalPaginas} (${totalLogs} registros)`;
        controlsContainer.innerHTML = `
            <button onclick="changeLogPage(-1)" class="bg-gray-200 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 disabled:opacity-50" ${logsPaginaAtual === 1 ? 'disabled' : ''}>
                Anterior
            </button>
            <span class="font-semibold">${logsPaginaAtual} / ${totalPaginas}</span>
            <button onclick="changeLogPage(1)" class="bg-gray-200 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 disabled:opacity-50" ${logsPaginaAtual >= totalPaginas ? 'disabled' : ''}>
                Próxima
            </button>
        `;
    } else {
        infoContainer.innerText = '';
        controlsContainer.innerHTML = '';
    }
}

/**
 * Muda a página atual dos logs e renderiza novamente.
 * @param {number} change - A mudança na página (+1 para próxima, -1 para anterior).
 */
function changeLogPage(change) {
    logsPaginaAtual += change;
    renderSystemLogs();
}
























// script.js (pode ser adicionado antes da seção de Autenticação)

// =================================================================================
// MÓDULO DE NOTIFICAÇÕES
// =================================================================================

let anexoNotificacao = null; // Guarda o anexo temporariamente

/**
 * Prepara o painel de envio de notificações no dashboard do admin.
 */
function setupNotificationSender() {
    // Verifica se o usuário tem permissão para enviar
    if (!hasPermission('notificacoes', 'enviar')) return;

    const destinatarioSelect = document.getElementById('notification-destinatario');
    if (!destinatarioSelect) return;

    destinatarioSelect.innerHTML = '<option value="todos">Todos os Usuários</option>';
    users.forEach(user => {
        // Não permite enviar para si mesmo
        if (user.username !== currentUser.username) {
            destinatarioSelect.innerHTML += `<option value="${user.username}">${user.username}</option>`;
        }
    });
}

// script.js

// script.js

/**
 * Lida com a seleção de um arquivo para anexo na notificação do DASHBOARD.
 * VERSÃO CORRIGIDA: Verifica se os elementos existem antes de usá-los.
 * @param {Event} event - O evento do input de arquivo.
 */
function handleDashboardAttachment(event) {
    const file = event.target.files[0];
    
    // Pega os elementos do painel de notificação do dashboard
    const labelEl = document.getElementById('notification-anexo-label');
    const previewContainer = document.getElementById('notification-anexo-preview');

    // *** CORREÇÃO PRINCIPAL APLICADA AQUI ***
    // Se os elementos não existem na tela atual, a função para silenciosamente.
    if (!labelEl || !previewContainer) {
        // Isso evita o erro quando a função é chamada em uma página que não seja o Dashboard.
        return; 
    }

    if (!file) {
        anexoNotificacao = null;
        labelEl.innerText = 'Nenhum arquivo selecionado.';
        previewContainer.innerHTML = '<p>Nenhum anexo.</p>';
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        anexoNotificacao = {
            nome: file.name,
            tipo: file.type,
            conteudo: e.target.result // Conteúdo em Base64
        };
        labelEl.innerText = file.name;
        
        // Exibe a pré-visualização
        if (file.type.startsWith('image/')) {
            previewContainer.innerHTML = `<img src="${e.target.result}" alt="Preview" class="max-h-40 rounded-lg mx-auto">`;
        } else {
            previewContainer.innerHTML = `<div class="text-center p-4 bg-gray-100 rounded-lg"><i class="fas fa-file-alt text-4xl text-gray-400"></i><p class="mt-2 text-sm font-semibold">${file.name}</p></div>`;
        }
    };
    reader.readAsDataURL(file);
}


/**
 * Envia a notificação para o(s) destinatário(s) selecionado(s).
 */
function enviarNotificacao() {
    if (!hasPermission('notificacoes', 'enviar')) {
        showToast('Você não tem permissão para enviar notificações.', 'error');
        return;
    }

    const destinatario = document.getElementById('notification-destinatario').value;
    const mensagem = document.getElementById('notification-mensagem').value.trim();

    if (!mensagem && !anexoNotificacao) {
        showToast('A notificação precisa ter uma mensagem ou um anexo.', 'error');
        return;
    }

    const novaNotificacao = {
        id: `notif-${Date.now()}`,
        remetente: currentUser.username,
        destinatario: destinatario, // 'todos' ou um username específico
        mensagem: mensagem,
        anexo: anexoNotificacao,
        timestamp: new Date().toISOString(),
        lidaPor: [] // Array para rastrear quem leu
    };

    notificacoes.unshift(novaNotificacao);
    saveData();

    showToast('Notificação enviada com sucesso!', 'success');
    logAction(`Notificação enviada para: ${destinatario}`);

    // Limpa o formulário
    document.getElementById('notification-mensagem').value = '';
    document.getElementById('notification-anexo-label').innerText = 'Nenhum arquivo selecionado.';
    document.getElementById('notification-anexo-preview').innerHTML = '<p>Nenhum anexo.</p>';
    document.getElementById('notification-anexo-input').value = '';
    anexoNotificacao = null;
}


// SUBSTITUA a função toggleNotificationPanel() inteira por esta:
function toggleNotificationPanel() {
    // Agora, clicar no sino simplesmente leva para a seção de chat
    showSection('chat');
    loadDynamicData('chat');
}


/**
 * Renderiza o conteúdo do painel de notificações para o usuário logado.
 */
function renderNotificationPanel() {
    const listContainer = document.getElementById('notification-list');
    
    const minhasNotificacoes = notificacoes.filter(n => 
        n.destinatario === 'todos' || n.destinatario === currentUser.username
    ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Ordena da mais nova para a mais antiga

    if (minhasNotificacoes.length === 0) {
        listContainer.innerHTML = '<p class="text-center text-gray-500 p-8">Nenhuma notificação para você.</p>';
        return;
    }

    listContainer.innerHTML = minhasNotificacoes.map(n => {
        const isLida = n.lidaPor.includes(currentUser.username);
        const anexoHtml = n.anexo ? `
            <div class="mt-3 pt-3 border-t">
                <a href="${n.anexo.conteudo}" download="${n.anexo.nome}" class="text-indigo-600 hover:underline text-sm flex items-center gap-2">
                    <i class="fas fa-download"></i> Baixar anexo: ${n.anexo.nome}
                </a>
            </div>` : '';

        return `
            <div class="notification-item p-4 rounded-lg ${isLida ? 'bg-gray-100' : 'bg-blue-50 border-l-4 border-blue-500'}">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="text-sm font-bold text-gray-800">${n.remetente}</p>
                        <p class="text-xs text-gray-500">${new Date(n.timestamp).toLocaleString('pt-BR')}</p>
                    </div>
                    ${!isLida ? `<button onclick="marcarComoLida('${n.id}')" class="text-blue-500 hover:text-blue-700 text-xs font-semibold">Marcar como lida</button>` : ''}
                </div>
                <p class="text-sm text-gray-700 mt-2 whitespace-pre-wrap">${n.mensagem}</p>
                ${anexoHtml}
            </div>
        `;
    }).join('');
}

/**
 * Marca uma notificação específica como lida.
 * @param {string} notifId - O ID da notificação.
 */
function marcarComoLida(notifId) {
    const notificacao = notificacoes.find(n => n.id === notifId);
    if (notificacao && !notificacao.lidaPor.includes(currentUser.username)) {
        notificacao.lidaPor.push(currentUser.username);
        saveData();
        updateNotificationCounter();
        renderNotificationPanel(); // Re-renderiza para remover o botão "marcar como lida"
    }
}

/**
 * Marca todas as notificações visíveis como lidas.
 */
function marcarTodasComoLidas() {
    notificacoes.forEach(n => {
        if ((n.destinatario === 'todos' || n.destinatario === currentUser.username) && !n.lidaPor.includes(currentUser.username)) {
            n.lidaPor.push(currentUser.username);
        }
    });
    saveData();
    updateNotificationCounter();
    renderNotificationPanel();
    showToast('Todas as notificações foram marcadas como lidas.', 'info');
}

// ATUALIZE a função updateNotificationCounter() para usar a nova estrutura de 'conversas'
function updateNotificationCounter() {
    const counter = document.getElementById('notification-counter');
    if (!counter) return;

    const naoLidas = conversas.filter(c =>
        (c.destinatario === 'todos' || c.destinatario === currentUser.username) &&
        !c.lidaPor.includes(currentUser.username)
    ).length;

    if (naoLidas > 0) {
        counter.innerText = naoLidas > 9 ? '9+' : naoLidas;
        counter.classList.remove('hidden');
    } else {
        counter.classList.add('hidden');
    }
}







// script.js

// =================================================================================
// FUNÇÃO CENTRAL DE REGISTRO DE TRANSAÇÕES DE ESTOQUE
// =================================================================================
/**
 * Registra uma transação de estoque.
 * @param {string} sku - O SKU do item.
 * @param {number} quantidade - A quantidade movimentada (positiva para entrada, negativa para saída).
 * @param {string} tipo - O tipo de transação (ex: 'ENTRADA', 'SAÍDA', 'AJUSTE', 'VENDA').
 * @param {string} prateleira - A prateleira afetada.
 * @param {string} [motivo=''] - Um motivo ou observação para a transação.
 */
function registrarTransacao(sku, quantidade, tipo, prateleira, motivo = '') {
    // Adicionado para segurança: verifica se currentUser existe
    const usuario = currentUser ? currentUser.username : 'Sistema';

    transacoesEstoque.unshift({
        id: `TRANS-${Date.now()}`,
        timestamp: new Date().toISOString(),
        usuario: usuario,
        sku: sku.toUpperCase(),
        quantidade: quantidade,
        tipo: tipo.toUpperCase(),
        prateleira: prateleira ? prateleira.toUpperCase() : 'N/A',
        motivo: motivo
    });

    // Limita o log para não crescer indefinidamente
    if (transacoesEstoque.length > 20000) {
        transacoesEstoque.pop();
    }
    // A função que chama esta será responsável por salvar os dados (saveData)
}


// =================================================================================
// AUTENTICAÇÃO E SESSÃO
// =================================================================================
function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
        currentUser = user;
        saveData();
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        document.getElementById('current-user').innerText = currentUser.username;
        initializeApp();
logAction({ acao: 'Login bem-sucedido', modulo: 'Login', funcao: 'login' });
        showToast('Login realizado com sucesso!', 'success');
    } else {
        alert('Usuário ou senha inválidos');
logAction({ acao: 'Tentativa de login falhou', modulo: 'Login', funcao: 'login', detalhes: { usuario_tentativa: username } });
        showToast('Usuário ou senha inválidos.', 'error');
    }
}

function logout() {
logAction({ acao: 'Logout realizado', modulo: 'Login', funcao: 'logout' });
    currentUser = null;
    localStorage.removeItem('saas_currentUser');
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('main-app').classList.add('hidden');
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    if(charts['general-report-chart']) charts['general-report-chart'].destroy();
}

function changePassword() {
    const oldPassword = prompt('Digite sua senha atual:');
    if (oldPassword !== currentUser.password) {
        showToast('Senha atual incorreta.', 'error');
        return;
    }
    const newPassword = prompt('Digite a nova senha (mínimo 6 caracteres):');
    if (newPassword && newPassword.length >= 6) {
        const userInDb = users.find(u => u.username === currentUser.username);
        userInDb.password = newPassword;
        currentUser.password = newPassword;
        saveData();
        showToast('Senha alterada com sucesso!', 'success');
        logAction('Senha alterada pelo próprio usuário.');
    } else {
        showToast('Senha inválida. A nova senha deve ter no mínimo 6 caracteres.', 'error');
    }
}

// =================================================================================
// VERIFICAÇÃO DE PERMISSÕES
// =================================================================================
function hasPermission(module, action) {
    if (!currentUser) return false;
    if (currentUser.permissions.all === true) return true; // Admin Master tem acesso a tudo

    const perms = currentUser.permissions;
    return perms[module] && perms[module][action];
}


// =================================================================================
// NAVEGAÇÃO E UI (SUBSTITUA ESTA SEÇÃO INTEIRA)
// =================================================================================

/**
 * Controla a visibilidade do menu em telas pequenas (mobile).
 * Mostra e esconde o menu e o overlay.
 */
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    // Alterna a posição do menu (para dentro ou para fora da tela)
    sidebar.classList.toggle('-translate-x-full');
    
    // Mostra ou esconde o fundo escuro (overlay)
    overlay.classList.toggle('hidden');
}





/**
 * Controla o estado retrátil (recolhido/expandido) do menu em telas grandes (desktop).
 */
function toggleSidebarCollapse() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('.md\\:ml-72');
    const textElements = document.querySelectorAll('.sidebar-text');
    const collapseIcon = document.getElementById('collapse-icon');

    // Adiciona ou remove a classe que define o estado "recolhido"
    sidebar.classList.toggle('md:w-24'); // Em telas médias, a largura muda para 24 (96px)
    mainContent.classList.toggle('md:ml-24'); // Ajusta a margem do conteúdo principal

    // Esconde ou mostra todos os textos dentro da sidebar
    textElements.forEach(el => {
        el.classList.toggle('hidden');
    });

    // Alterna o ícone do botão entre setas para a esquerda e para a direita
    if (sidebar.classList.contains('md:w-24')) {
        collapseIcon.classList.remove('fa-angle-double-left');
        collapseIcon.classList.add('fa-angle-double-right');
    } else {
        collapseIcon.classList.remove('fa-angle-double-right');
        collapseIcon.classList.add('fa-angle-double-left');
    }
}

// O restante das suas funções de navegação (showSection, initializeApp, etc.)
// pode permanecer como está.





function showSection(id) {
    // 1. Esconde TODAS as seções que são conteúdo principal
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.add('hidden');
    });

    // 2. Mostra APENAS a seção com o ID solicitado
    const sectionToShow = document.getElementById(id);
    if (sectionToShow) {
        sectionToShow.classList.remove('hidden');
    }

    // 3. (Opcional, mas bom para mobile) Esconde a sidebar após um clique
    if (window.innerWidth <= 768 && !document.getElementById('sidebar').classList.contains('sidebar-hidden')) {
        // A função toggleSidebar() já deve existir no seu código
        // Se não existir, adicione-a.
    }
}


/**
 * Inicializa a aplicação, garantindo que a primeira seção visível
 * e sua aba correspondente sejam carregadas corretamente.
 */
function initializeApp() {
    loadMenu();
    applyPermissionsToUI();
    updateNotificationCounter(); // <-- ADICIONE ESTA LINHA

    const firstVisibleButton = document.querySelector('#nav-menu button:not([onclick^="changePassword"]):not([onclick^="logout"])');
    const firstVisibleSectionId = firstVisibleButton?.getAttribute('onclick')?.match(/'([^']+)'/)[1];

    // Se a primeira seção for o dashboard, prepara o painel de envio.
    if (firstVisibleSectionId === 'admin-dashboard') {
        setupNotificationSender();
    }



    if (firstVisibleSectionId) {
        // Mostra a seção principal (ex: 'pedidos')
        showSection(firstVisibleSectionId);
        // Carrega os dados dinâmicos dessa seção (ex: loadPedidos())
        loadDynamicData(firstVisibleSectionId);

        // ======================= INÍCIO DA CORREÇÃO =======================
        // Se a primeira seção a ser aberta for a de pedidos, garantimos
        // que a aba 'ml' (Mercado Livre) seja ativada, exibindo seus erros.
        if (firstVisibleSectionId === 'pedidos') {
            showTab('ml');
        }
        // ======================== FIM DA CORREÇÃO =========================

    } else {
        // Se o usuário não tem permissão para ver nenhuma seção
        showSection('no-permission');
    }
}


// =================================================================================
// NAVEGAÇÃO E UI (ATUALIZAR MENUS E CARREGAMENTO DINÂMICO)
// =================================================================================

// ATUALIZE A FUNÇÃO loadMenu()
function loadMenu() {
    const nav = document.getElementById('nav-menu');
    nav.innerHTML = '';

    const menuItems = [
        { id: 'admin-dashboard', label: 'Dashboard', icon: 'fa-tachometer-alt', module: 'dashboard', action: 'visualizar', role: 'admin-master' },
        { id: 'user-management', label: 'Gestão de Usuários', icon: 'fa-users', module: 'userManagement', action: 'visualizar', role: 'admin-master' },
        { id: 'system-logs', label: 'Logs do Sistema', icon: 'fa-file-alt', module: 'logs', action: 'visualizar', role: 'admin-master' },
        { id: 'chat', label: 'Chat Interno', icon: 'fa-comments', module: 'chat', action: 'visualizar' },
        { id: 'processador-eans', label: 'Processador de EANs', icon: 'fa-barcode', module: 'processadorEANs', action: 'visualizar' },
        // *** NOVA LINHA ADICIONADA AQUI ***
        { id: 'estoque', label: 'Estoque', icon: 'fa-boxes', module: 'estoque', action: 'visualizar' },
        { id: 'pedidos', label: 'Pedidos', icon: 'fa-shopping-cart', module: 'pedidos', action: 'visualizar' },
        { id: 'banco-imagens', label: 'Banco de Imagens', icon: 'fa-images', module: 'bancoImagens', action: 'visualizar' },
        { id: 'producao', label: 'Produção', icon: 'fa-cogs', module: 'producao', action: 'visualizar' },
        { id: 'costura', label: 'Costura', icon: 'fa-cut', module: 'costura', action: 'visualizar' },
        { id: 'expedicao', label: 'Expedição', icon: 'fa-shipping-fast', module: 'expedicao', action: 'visualizar' }
    ];

    menuItems.forEach(item => {
        const isAdminItem = item.role === 'admin-master';
        const userIsAdmin = currentUser.role === 'admin-master';

        if ((isAdminItem && userIsAdmin) || (!isAdminItem && hasPermission(item.module, item.action))) {
            nav.innerHTML += `
                <button 
                    onclick="showSection('${item.id}'); loadDynamicData('${item.id}')" 
                    class="w-full text-left p-3 hover:bg-gray-700 rounded-lg transition flex items-center space-x-4 nav-item"
                    title="${item.label}">
                    <i class="fas ${item.icon} w-6 text-center text-lg"></i>
                    <span class="sidebar-text whitespace-nowrap">${item.label}</span>
                </button>`;
        }
    });

    nav.innerHTML += `<div class="border-t border-gray-700 mt-4 pt-4"></div>`;
    nav.innerHTML += `
        <button onclick="changePassword()" class="w-full text-left p-3 hover:bg-gray-700 rounded-lg transition flex items-center space-x-4" title="Alterar Senha">
            <i class="fas fa-key w-6 text-center text-lg"></i>
            <span class="sidebar-text whitespace-nowrap">Alterar Senha</span>
        </button>`;
}

// ATUALIZE A FUNÇÃO loadDynamicData()
function loadDynamicData(sectionId) {
    const sectionElement = document.getElementById(sectionId);
    if (!sectionElement || sectionElement.classList.contains('hidden')) {
        return;
    }

    const dataLoaders = {
        'admin-dashboard': () => { loadAdminDashboard(); setupNotificationSender(); },
        'user-management': loadUserManagement,
        'system-logs': updateLogs,
        'estoque': loadEstoque,
        'pedidos': loadPedidos,
        // *** NOVA LINHA ADICIONADA AQUI ***
        'processador-eans': () => { applyPermissionsToUI(); }, // Apenas aplica permissões, pois não há dados a carregar do localStorage
        'processador-eans': renderizarModuloEANs, // Chama a nova função principal
        'banco-imagens': loadBancoImagens,
        'producao': loadProducao,
        'costura': loadCostura,
        'chat': loadChat,
        'expedicao': loadExpedicao
    };

    if (dataLoaders[sectionId]) {
        dataLoaders[sectionId]();
    }
}




function applyPermissionsToUI() {
    document.querySelectorAll('[data-permission]').forEach(el => {
        const [module, action] = el.getAttribute('data-permission').split(':');
        if (hasPermission(module, action)) {
            el.style.display = '';
        } else {
            el.style.display = 'none';
        }
    });
}

// =================================================================================
// DASHBOARD ADMIN
// =================================================================================
// =================================================================================
// NOVAS FUNÇÕES PARA O DASHBOARD ADMIN
// =================================================================================

/**
 * Carrega todos os componentes do Dashboard Admin, incluindo o novo histórico e gráfico.
 */
function loadAdminDashboard() {
    if (!hasPermission('dashboard', 'visualizar')) return;
    loadMetrics();
    updateLogs();
    renderArtHistory(); // NOVO: Chama a função para renderizar o histórico de artes
    renderPrinterLoadChart(); // NOVO: Chama a função para renderizar o gráfico das impressoras
}

/**
 * Renderiza o histórico das últimas artes enviadas para produção no painel.
 */
function renderArtHistory() {
    const container = document.getElementById('art-history-logs');
    if (!container) return;

    // Pega as 20 entradas mais recentes do histórico.
    const historicoRecente = historicoArtes.slice(0, 20);

    if (historicoRecente.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center">Nenhuma arte foi enviada para produção ainda.</p>';
        return;
    }

    container.innerHTML = historicoRecente.map(item => `
        <div class="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
            <div class="flex-shrink-0 bg-indigo-100 text-indigo-600 rounded-full h-8 w-8 flex items-center justify-center">
                <i class="fas fa-print"></i>
            </div>
            <div class="flex-1">
                <p class="text-sm font-semibold text-gray-800">
                    ${item.quantidade}x ${item.sku} &rarr; Impressora ${item.impressora}
                </p>
                <p class="text-xs text-gray-500">
                    Enviado por ${item.usuario} em ${new Date(item.timestamp).toLocaleString('pt-BR')}
                </p>
            </div>
        </div>
    `).join('');
}

/**
 * Calcula e renderiza o gráfico de barras com a quantidade de artes por impressora.
 */
function renderPrinterLoadChart() {
    const chartId = 'printer-load-chart';
    if (charts[chartId]) {
        charts[chartId].destroy(); // Destrói o gráfico antigo para evitar sobreposição
    }
    const ctx = document.getElementById(chartId)?.getContext('2d');
    if (!ctx) return;

    // Calcula a contagem de artes por impressora a partir do histórico
    const contagemImpressoras = historicoArtes.reduce((acc, item) => {
        const impressora = `Impressora ${item.impressora}`;
        acc[impressora] = (acc[impressora] || 0) + item.quantidade;
        return acc;
    }, {});

    const labels = Object.keys(contagemImpressoras);
    const data = Object.values(contagemImpressoras);

    charts[chartId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total de Artes Produzidas',
                data: data,
                backgroundColor: [
                    'rgba(75, 192, 192, 0.6)',
                    'rgba(255, 159, 64, 0.6)',
                    'rgba(255, 99, 132, 0.6)',
                    'rgba(153, 102, 255, 0.6)',
                    'rgba(54, 162, 235, 0.6)',
                ],
                borderColor: [
                    'rgba(75, 192, 192, 1)',
                    'rgba(255, 159, 64, 1)',
                    'rgba(255, 99, 132, 1)',
                    'rgba(153, 102, 255, 1)',
                    'rgba(54, 162, 235, 1)',
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Quantidade de Artes'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false // Oculta a legenda, pois o título do gráfico já é descritivo
                }
            }
        }
    });
}


// Arquivo: script.js

function loadMetrics() {
    // ======================= INÍCIO DA ALTERAÇÃO =======================
    
    // 1. Calcula a soma total de todas as unidades (peças) no estoque.
    const totalUnidades = itensEstoque.reduce((total, item) => total + item.qtd, 0);

    // 2. Calcula o número de SKUs únicos (produtos distintos).
    // Usamos um Set para garantir que cada SKU seja contado apenas uma vez.
    const skusUnicos = new Set(itensEstoque.map(item => item.sku));
    const totalSkus = skusUnicos.size;

    // ======================== FIM DA ALTERAÇÃO =========================

    const metricsData = {
        // O valor principal do card será o total de unidades.
        estoque: totalUnidades, 
        pedidos: pedidos.length,
        imagens: images.length,
        producao: producao.length,
        costura: costura.length,
        expedicao: expedicao.length
    };

    const metricsDiv = document.getElementById('metrics');
    if (!metricsDiv) return;
    metricsDiv.innerHTML = '';

    const metricConfig = {
        estoque: { icon: 'fa-boxes', color: 'from-blue-500 to-cyan-600' },
        pedidos: { icon: 'fa-shopping-cart', color: 'from-orange-500 to-red-600' },
        imagens: { icon: 'fa-images', color: 'from-pink-500 to-rose-600' },
        producao: { icon: 'fa-cogs', color: 'from-yellow-500 to-orange-600' },
        costura: { icon: 'fa-cut', color: 'from-teal-500 to-cyan-600' },
        expedicao: { icon: 'fa-shipping-fast', color: 'from-purple-500 to-indigo-600' }
    };

    for (let key in metricsData) {
        // ======================= INÍCIO DA ALTERAÇÃO NO HTML =======================
        let descriptionText;
        if (key === 'estoque') {
            // Texto personalizado para o card de estoque, mostrando ambos os totais.
            descriptionText = `<span class="font-semibold">${totalSkus}</span> SKUs distintos`;
        } else {
            descriptionText = 'Total de registros';
        }
        // ======================== FIM DA ALTERAÇÃO NO HTML =========================

        metricsDiv.innerHTML += `
            <div class="metric-card card-hover">
                <div class="flex items-center justify-between mb-4">
                    <div class="w-12 h-12 bg-gradient-to-r ${metricConfig[key].color} rounded-xl flex items-center justify-center shadow-lg">
                        <i class="fas ${metricConfig[key].icon} text-white text-xl"></i>
                    </div>
                    <div class="text-right">
                        <p class="text-3xl font-bold bg-gradient-to-r ${metricConfig[key].color} bg-clip-text text-transparent">${metricsData[key]}</p>
                    </div>
                </div>
                <h3 class="text-lg font-semibold text-gray-700 capitalize">${key === 'estoque' ? 'Unidades em Estoque' : key}</h3>
                <p class="text-sm text-gray-500 mt-1">${descriptionText}</p>
            </div>
        `;
    }
    loadGeneralReportChart(metricsData);
}


function loadGeneralReportChart(data) {
    const chartId = 'general-report-chart';
    if (charts[chartId]) charts[chartId].destroy();
    const ctx = document.getElementById(chartId)?.getContext('2d');
    if (!ctx) return;

    charts[chartId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(data),
            datasets: [{
                label: 'Métricas Gerais',
                data: Object.values(data),
                backgroundColor: ['#3B82F6', '#F97316', '#EC4899', '#F59E0B', '#14B8A6', '#8B5CF6'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } }
        }
    });
}

// =================================================================================
// GESTÃO DE USUÁRIOS (VERSÃO COM ADMIN DE SETOR)
// =================================================================================

function loadUserManagement() {
    if (!hasPermission('userManagement', 'visualizar')) return;
    
    loadUsersTable();
    populateUserPermissionSelector();
    loadPermissionModules();
    
    // Adiciona o botão para abrir o modal de atribuição de grupos de costura
    const permissionsDiv = document.querySelector('div[data-permission="userManagement:editar"]');
    if (permissionsDiv && !document.getElementById('btn-atribuir-grupos')) {
        const selectUser = permissionsDiv.querySelector('#perm-user');
        selectUser.insertAdjacentHTML('beforebegin', `
            <button id="btn-atribuir-grupos" onclick="abrirModalAtribuirGrupos()" class="mb-6 bg-purple-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-purple-700">
                <i class="fas fa-tasks mr-2"></i>Atribuir Grupos de Costura
            </button>
        `);
    }
    
    applyPermissionsToUI();
}






/**
 * Cria um novo usuário, agora com validações para o papel 'admin-setor' e inicialização correta.
 */
function createUser() {
    if (!hasPermission('userManagement', 'criar')) {
        showToast('Você não tem permissão para criar usuários.', 'error');
        return;
    }
    const username = document.getElementById('new-user').value.trim();
    const password = document.getElementById('new-pass').value.trim();
    const role = document.getElementById('new-role').value;

    if (!username || !password || password.length < 6) {
        showToast('Usuário e senha (mínimo 6 caracteres) são obrigatórios.', 'error');
        return;
    }
    if (users.find(u => u.username === username)) {
        showToast('Este nome de usuário já existe.', 'error');
        return;
    }

    // Adiciona o novo usuário ao array com todas as propriedades necessárias inicializadas
    users.push({
        username,
        password,
        role,
        setor: null, // O setor será definido pelo Admin de Setor posteriormente.
        permissions: JSON.parse(JSON.stringify(defaultPermissions)),
        gruposCostura: [] // <-- ESTA É A CORREÇÃO PRINCIPAL!
    });

    saveData();
    loadUserManagement(); // Recarrega a seção para refletir as mudanças
logAction({
    acao: 'Novo usuário criado',
    modulo: 'Usuários',
    funcao: 'createUser',
    detalhes: { novo_usuario: username, role: role }
});
    showToast(`Usuário ${username} criado com sucesso!`, 'success');
    
    // Limpa os campos do formulário
    document.getElementById('new-user').value = '';
    document.getElementById('new-pass').value = '';
}

function loadUsersTable() {
    const table = document.getElementById('users-table').querySelector('tbody');
    table.innerHTML = '';

    let usuariosVisiveis = [];
    if (currentUser.role === 'admin-master') {
        usuariosVisiveis = users;
    } else if (currentUser.role === 'admin-setor') {
        usuariosVisiveis = users.filter(u => u.setor === currentUser.setor || !u.setor);
    }

    usuariosVisiveis.forEach(user => {
        const roleColors = {
            'admin-master': 'bg-red-100 text-red-800',
            'admin-setor': 'bg-blue-100 text-blue-800',
            'user': 'bg-green-100 text-green-800'
        };

        let deleteButton = '';
        const canDelete = (currentUser.role === 'admin-master' && user.username !== currentUser.username) ||
                          (currentUser.role === 'admin-setor' && user.setor === currentUser.setor && user.role !== 'admin-master' && user.username !== currentUser.username);

        if (canDelete && hasPermission('userManagement', 'excluir')) {
            deleteButton = `<button onclick="deleteUser('${user.username}')" class="text-red-600 hover:text-red-800" title="Excluir"><i class="fas fa-trash"></i></button>`;
        }

        table.innerHTML += `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="p-4 font-medium text-gray-900">${user.username}</td>
                <td class="p-4">
                    <span class="px-3 py-1 rounded-full text-xs font-semibold ${roleColors[user.role] || 'bg-gray-100 text-gray-800'}">
                        ${user.role}
                    </span>
                </td>
                <td class="p-4">${deleteButton}</td>
            </tr>
        `;
    });
}


/**
 * Exclui um usuário, usando o username como identificador único e seguro.
 */
function deleteUser(username) {
    const userToDelete = users.find(u => u.username === username);
    if (!userToDelete) return;

    // Validações de permissão para deletar, espelhando a lógica de exibição do botão
    if (!hasPermission('userManagement', 'excluir')) {
        showToast('Você não tem permissão para excluir usuários.', 'error');
        return;
    }
    if (userToDelete.username === currentUser.username) {
        showToast('Você não pode excluir seu próprio usuário.', 'error');
        return;
    }
    if (currentUser.role === 'admin-setor' && userToDelete.setor !== currentUser.setor) {
        showToast('Você só pode excluir usuários do seu próprio setor.', 'error');
        return;
    }
    if (userToDelete.role === 'admin-master') {
        showToast('Não é possível excluir um usuário Admin Master.', 'error');
        return;
    }

    if (confirm(`Tem certeza que deseja excluir o usuário ${username}?`)) {
        users = users.filter(u => u.username !== username);
        saveData();
        loadUserManagement();
        logAction(`Usuário excluído: ${username}`);
        showToast(`Usuário ${username} excluído.`, 'success');
    }
}

/**
 * Popula o dropdown de seleção de usuário para edição de permissões,
 * mostrando apenas os usuários que o admin logado pode gerenciar.
 */

function populateUserPermissionSelector() {
    const permUserSelect = document.getElementById('perm-user');
    permUserSelect.innerHTML = '<option value="">Selecione um usuário para editar permissões...</option>';

    let usuariosGerenciaveis = [];
    if (currentUser.role === 'admin-master') {
        usuariosGerenciaveis = users.filter(u => u.role !== 'admin-master');
    } else if (currentUser.role === 'admin-setor') {
        usuariosGerenciaveis = users.filter(u => (u.setor === currentUser.setor || !u.setor) && u.role !== 'admin-master' && u.role !== 'admin-setor');
    }

    usuariosGerenciaveis.forEach(u => {
        permUserSelect.innerHTML += `<option value="${u.username}">${u.username}</option>`;
    });
}




// ATUALIZE A FUNÇÃO loadPermissionModules()
function loadPermissionModules() {
    const modules = [
        { key: 'estoque', label: 'Estoque', actions: ['visualizar', 'cadastrar', 'editar', 'excluir', 'movimentar'] },
        { key: 'pedidos', label: 'Pedidos', actions: ['visualizar', 'cadastrar', 'importar', 'editar', 'excluir'] },
        // *** NOVA LINHA ADICIONADA AQUI ***
        { key: 'processadorEANs', label: 'Processador de EANs', actions: ['visualizar', 'processar'] },
        { key: 'bancoImagens', label: 'Banco de Imagens', actions: ['visualizar', 'adicionar', 'excluir'] },
        { key: 'producao', label: 'Produção', actions: ['visualizar', 'adicionar', 'editar', 'excluir'] },
        { key: 'costura', label: 'Costura', actions: ['visualizar', 'adicionar', 'editar', 'excluir'] },
        { key: 'expedicao', label: 'Expedição', actions: ['visualizar', 'adicionar', 'editar', 'excluir'] },
        { key: 'chat', label: 'Chat Interno', actions: ['visualizar', 'enviar'] }
    ];

    const div = document.getElementById('modules-perm');
    div.innerHTML = '';

    modules.forEach(m => {
        let moduleHtml = `
            <div class="p-4 bg-gray-100 rounded-lg">
                <h4 class="font-semibold text-gray-800 mb-2">${m.label}</h4>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
        `;
        m.actions.forEach(action => {
            moduleHtml += `
                <label class="flex items-center text-sm text-gray-600">
                    <input type="checkbox" data-module="${m.key}" data-action="${action}" class="w-4 h-4 mr-2 text-indigo-600 focus:ring-indigo-500">
                    ${action.charAt(0).toUpperCase() + action.slice(1)}
                </label>
            `;
        });
        moduleHtml += `</div></div>`;
        div.innerHTML += moduleHtml;
    });

    document.getElementById('perm-user').addEventListener('change', displayUserPermissions);
}

function displayUserPermissions() {
    const username = document.getElementById('perm-user').value;
    const user = users.find(u => u.username === username);
    const checkboxes = document.querySelectorAll('#modules-perm input[type="checkbox"]');

    if (user) {
        checkboxes.forEach(cb => {
            const module = cb.dataset.module;
            const action = cb.dataset.action;
            cb.checked = user.permissions[module] && user.permissions[module][action];
        });
    } else {
        checkboxes.forEach(cb => cb.checked = false);
    }
}

function savePermissions() {
    if (!hasPermission('userManagement', 'editar')) {
        showToast('Você não tem permissão para editar permissões.', 'error');
        return;
    }
    const username = document.getElementById('perm-user').value;
    if (!username) {
        showToast('Selecione um usuário para definir as permissões.', 'error');
        return;
    }
    const user = users.find(u => u.username === username);
    if (!user) {
        showToast('Usuário não encontrado.', 'error');
        return;
    }

    document.querySelectorAll('#modules-perm input[type="checkbox"]').forEach(cb => {
        const module = cb.dataset.module;
        const action = cb.dataset.action;
        if (!user.permissions[module]) {
            user.permissions[module] = {};
        }
        user.permissions[module][action] = cb.checked;
    });

    saveData();
    logAction(`Permissões salvas para o usuário: ${username}`);
    showToast('Permissões salvas com sucesso!', 'success');
}


// =================================================================================
// MÓDULO DE ESTOQUE
// =================================================================================



// =================================================================================
// FUNÇÕES PARA IMPORTAÇÃO DE ESTOQUE - AJUSTADO PARA ACEITAR TEXTO OU ARQUIVO
// =================================================================================

// 1. Função que aciona a seleção do arquivo .xlsx (sem alterações)
function triggerXlsxImport() {
    if (!hasPermission('estoque', 'cadastrar')) {
        showToast('Permissão negada para importar estoque.', 'error');
        return;
    }
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx, .xls'; // Aceita formatos modernos e antigos do Excel
    fileInput.onchange = (event) => {
        const file = event.target.files[0];
        if (file) {
            handleXlsxFile(file);
        }
    };
    fileInput.click();
}

// 2. Função que lê o arquivo Excel usando a biblioteca SheetJS (sem alterações)
function handleXlsxFile(file) {
    const reader = new FileReader();

    reader.onload = (event) => {
        try {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            // Chama a função de processamento com os dados do Excel
            processData(jsonData);

        } catch (error) {
            console.error("Erro ao processar arquivo Excel:", error);
            showToast('Falha ao ler o arquivo Excel. Verifique se o formato está correto.', 'error');
        }
    };

    reader.onerror = () => {
        showToast('Erro ao ler o arquivo.', 'error');
    };

    reader.readAsArrayBuffer(file);
}

// 3. Função que processa os dados (AJUSTADA COM PROTEÇÃO CONTRA ERROS)
// Arquivo: script.js

// script.js

/**
 * Processa os dados de uma planilha (ou texto) para adicionar ou atualizar itens no estoque,
 * registrando a transação como 'CADASTRO' para itens novos e 'ENTRADA' para atualizações.
 * @param {Array<Array<string>>} data - Os dados da planilha, onde a primeira linha é o cabeçalho.
 */
function processData(data) {
    let dataRows;
    const headers = data[0].map(h => h.toString().toLowerCase().trim()); // Pega os cabeçalhos

    // Encontra o índice das colunas essenciais e das opcionais
    const skuIndex = headers.indexOf('sku');
    const qtdIndex = headers.indexOf('qtd');
    const prateleiraIndex = headers.indexOf('prateleira');
    const capacidadeIndex = headers.indexOf('capacidade');
    const minStockIndex = headers.indexOf('estoque min.') || headers.indexOf('estoque minimo');

    // Validação de cabeçalhos essenciais
   if (data[0] && isNaN(parseInt(data[0][1]))) { // Se o segundo item da primeira linha não for um número, assume-se que é um cabeçalho.
        dataRows = data.slice(1);
    } else {
        dataRows = data;
    }

    if (dataRows.length === 0) {
        showToast('Nenhum dado para processar na planilha.', 'info');
        return;
    }

    let totalQtdAdded = 0;
    let totalQtdUpdated = 0;
    let errorLines = [];

    dataRows.forEach((row, index) => {
        // Ignora linhas completamente vazias ou que não sejam um array
        if (!Array.isArray(row) || row.every(cell => cell === null || cell === '')) {
            return;
        }

        // Lê os dados com base na POSIÇÃO da coluna
        const sku = row[0] ? String(row[0]).trim() : null;
        const qtd = parseInt(row[1]);
        const prateleira = row[2] ? String(row[2]).trim() : null;
        
        // Colunas opcionais (se existirem, serão lidas; senão, ignoradas)
        const capacidade = !isNaN(parseInt(row[3])) ? parseInt(row[3]) : 25; // Padrão 25
        const minStock = !isNaN(parseInt(row[4])) ? parseInt(row[4]) : ESTOQUE_BAIXO_THRESHOLD; // Padrão do sistema

        // Validação dos dados essenciais da linha
        if (!sku || isNaN(qtd) || !prateleira) {
            errorLines.push({ line: index + 2, reason: `Dados inválidos ou colunas faltando na linha.` });
            return;
        }

        // Procura pelo item existente
        const existingItem = itensEstoque.find(item => 
            item.sku.toUpperCase() === sku.toUpperCase() &&
            item.prateleira.toUpperCase() === prateleira.toUpperCase()
        );

        if (existingItem) {
            // --- LÓGICA PARA ITEM EXISTENTE ---
            existingItem.qtd += qtd;
            totalQtdUpdated += qtd;
            registrarTransacao(sku, qtd, 'ENTRADA', prateleira, 'Entrada via Importação de Planilha');

        } else {
            // --- LÓGICA PARA ITEM NOVO (CADASTRO) ---
            itensEstoque.push({
                id: Date.now() + Math.random(),
                sku: sku.toUpperCase(),
                prateleira: prateleira.toUpperCase(),
                qtd: qtd,
                capacidade: capacidade,
                minStock: minStock,
                status: 'Disponível',
                reservadoPor: null
            });
            totalQtdAdded += qtd;
            registrarTransacao(sku, qtd, 'CADASTRO', prateleira, 'Cadastro via Importação de Planilha');
        }
    });

    // Feedback final para o usuário
    if (totalQtdAdded > 0 || totalQtdUpdated > 0) {
        saveData();
        applyFilters();
        const message = `${totalQtdAdded} unidade(s) nova(s) cadastrada(s) e ${totalQtdUpdated} unidade(s) adicionada(s) ao estoque.`;
        logAction(message);
        showToast(message, 'success');
    } else if (errorLines.length === 0) {
        showToast('Nenhum item novo foi adicionado. Verifique os dados da planilha.', 'info');
    }

    if (errorLines.length > 0) {
        const errorDetails = errorLines.map(e => `Linha ${e.line}: ${e.reason}`).join('\n');
        setTimeout(() => alert(`Atenção: ${errorLines.length} linha(s) da planilha não puderam ser importadas.\n\n${errorDetails}`), 500);
    }
}









function loadEstoque() {
    if (!hasPermission('estoque', 'visualizar')) return;
    
    // Adiciona os "escutadores" de eventos aos campos de filtro restantes
    document.getElementById('filter-sku').addEventListener('input', applyFilters);
    // A linha abaixo foi removida:
    // document.getElementById('filter-prateleira').addEventListener('input', applyFilters);
    document.getElementById('filter-status').addEventListener('change', applyFilters);
    document.getElementById('mov-sku-terminal').addEventListener('input', updateAvailableShelves);

    applyFilters();
    applyPermissionsToUI();
}

function applyFilters() {
    const filterSku = document.getElementById('filter-sku').value;
    // A linha abaixo foi removida:
    // const filterPrateleira = document.getElementById('filter-prateleira').value;
    const filterStatus = document.getElementById('filter-status').value;
    
    // Passamos apenas os filtros existentes para a função loadItens
    loadItens({ sku: filterSku, status: filterStatus });
}



function handlePrecisionSearch() {
    const filterSkuValue = document.getElementById('filter-sku').value.toLowerCase();
    const filterPrateleira = document.getElementById('filter-prateleira').value.toLowerCase();
    const filterStatus = document.getElementById('filter-status').value;
    const table = document.getElementById('itens-table');
    if (!table) return;

    const canDelete = hasPermission('estoque', 'excluir');
    const canReserve = hasPermission('estoque', 'movimentar'); // Usamos a permissão de movimentar para reservar

    // 1. Agrupar dados por SKU para obter o total e verificar a necessidade do botão de reserva
    const skuData = itensEstoque.reduce((acc, item) => {
        const sku = item.sku.toLowerCase();
        if (!acc[sku]) {
            acc[sku] = { total: 0, locations: [], minStockValues: new Set() };
        }
        acc[sku].total += item.qtd;
        acc[sku].locations.push(item);
        acc[sku].minStockValues.add(item.minStock);
        return acc;
    }, {});

    // 2. Filtrar os itens com base em TODOS os filtros da tela
    const skusToSearch = filterSkuValue.split(/[,;\s]+/).filter(s => s.trim() !== '');

    let itensFiltrados = itensEstoque.filter(item => {
        const itemSkuLower = item.sku.toLowerCase();
        
        const skuMatch = skusToSearch.length === 0 ? true : skusToSearch.includes(itemSkuLower);
        const prateleiraMatch = item.prateleira.toLowerCase().includes(filterPrateleira);
        
        const data = skuData[itemSkuLower];
        const isLowStock = data.total <= item.minStock;
        const isOverCapacity = item.qtd > item.capacidade;
        
        let statusMatch = true;
        if (filterStatus === 'low') statusMatch = isLowStock;
        else if (filterStatus === 'over') statusMatch = isOverCapacity;
        else if (filterStatus === 'ok') statusMatch = !isLowStock && !isOverCapacity;

        return skuMatch && prateleiraMatch && statusMatch;
    });

    // 3. Montar a tabela com os resultados e o botão de reserva quando aplicável
    const tableHead = `
        <thead class="sticky top-0 bg-gray-100 z-10">
            <tr class="border-b">
                <th class="p-4 text-left w-16">Img</th>
                <th class="p-4 text-left">SKU</th>
                <th class="p-4 text-left">Prateleira</th>
                <th class="p-4 text-left">Qtd. na Prateleira</th>
                <th class="p-4 text-left">Estoque Total (SKU)</th>
                <th class="p-4 text-left">Status</th>
                <th class="p-4 text-left">Ações</th>
            </tr>
        </thead>`;

    let tableBody = '<tbody>';
    if (itensFiltrados.length === 0) {
        tableBody += `<tr><td colspan="7" class="text-center p-8 text-gray-500">Nenhum item encontrado com os filtros aplicados.</td></tr>`;
    } else {
        itensFiltrados.forEach(item => {
            const itemSkuLower = item.sku.toLowerCase();
            const data = skuData[itemSkuLower];
            const isLowStock = data.total <= item.minStock;
            const isOverCapacity = item.qtd > item.capacidade;
            const imageUrl = imageMap[itemSkuLower]; // Procura a URL da imagem no mapa



            let imageCellHtml = '';
            if (imageUrl) {
            // Se encontrou uma imagem, cria um botão que chama o modal
            imageCellHtml = `
                <td class="p-4 text-center">
                    <button onclick="openImageZoomModal('${imageUrl}')" class="text-indigo-500 hover:text-indigo-700 text-xl" title="Clique para ampliar a imagem">
                        <i class="fas fa-camera"></i>
                    </button>
                </td>`;
        } else {
            // Se não encontrou, mostra um ícone genérico
            imageCellHtml = `
                <td class="p-4 text-center">
                    <i class="fas fa-image text-gray-300 text-lg" title="Sem imagem disponível"></i>
                </td>`;
        }

        tableBody += `
            <tr data-id="${item.id}" class="border-b ...">
                ${imageCellHtml}
                <td class="p-4 font-semibold ...">${item.sku}</td>
                <!-- ... resto das colunas ... -->
            </tr>`;

            let statusClass = 'bg-green-100 text-green-800';
            let statusText = 'OK';
            if (isLowStock) { statusClass = 'bg-yellow-100 text-yellow-800 animate-pulse'; statusText = 'Estoque Baixo'; }
            if (isOverCapacity) { statusClass = 'bg-red-100 text-red-800 font-bold'; statusText = 'Excedido!'; }

            // Lógica do botão de reserva
            let actionButtons = '';
            if (canDelete) {
                actionButtons += `<button onclick="deleteItem('${item.id}')" class="text-gray-400 hover:text-red-600 mr-4" title="Excluir"><i class="fas fa-trash"></i></button>`;
            }
            if (canReserve && data.total === 1 && item.qtd === 1) {
                actionButtons += `<button onclick="reserveItem('${item.id}', '${item.sku}')" class="bg-indigo-500 text-white px-3 py-1 rounded-lg text-xs font-semibold hover:bg-indigo-600" title="Reservar item">Reservar</button>`;
            }

            tableBody += `
                <tr data-id="${item.id}" class="border-b border-gray-200 hover:bg-indigo-50 transition-colors duration-200">
                    <td class="p-4 text-center"><i class="fas fa-image text-gray-400 text-lg"></i></td>
                    <td class="p-4 font-semibold text-gray-800">${item.sku}</td>
                    <td class="p-4 text-gray-600 editable" ondblclick="editCell(this, '${item.id}', 'prateleira')">${item.prateleira}</td>
                    <td class="p-4 font-bold text-lg text-indigo-600 editable" ondblclick="editCell(this, '${item.id}', 'qtd')">${item.qtd}</td>
                    <td class="p-4 text-gray-600">${data.total}</td>
                    <td class="p-4"><span class="px-3 py-1 rounded-full text-xs font-semibold ${statusClass}">${statusText}</span></td>
                    <td class="p-4">${actionButtons || '<span class="text-xs text-gray-400">-</span>'}</td>
                </tr>`;
        });
    }
    tableBody += '</tbody>';
    table.innerHTML = tableHead + tableBody;
}


// script.js

function reserveItem(itemId, sku) {
    if (!hasPermission('estoque', 'movimentar')) {
        showToast('Você não tem permissão para reservar itens.', 'error');
        return;
    }

    const itemIndex = itensEstoque.findIndex(i => i.id == itemId);
    if (itemIndex === -1) {
        showToast('Erro: Item não encontrado para reserva.', 'error');
        return;
    }
    
    const item = itensEstoque[itemIndex];

    if (confirm(`Tem certeza que deseja reservar e bloquear a última unidade do SKU ${sku.toUpperCase()}?`)) {
        // ======================= INÍCIO DA ALTERAÇÃO =======================
        // Registra a saída da unidade que está sendo reservada
        registrarTransacao(item.sku, -1, 'RESERVA', item.prateleira, `Bloqueado por ${currentUser.username}`);
        // ======================== FIM DA ALTERAÇÃO =========================

        item.status = 'Reservado';
        item.qtd = 0; 
        item.reservadoPor = currentUser.username; 
        
        saveData();
        logAction(`Item reservado e bloqueado por ${currentUser.username}: SKU ${sku.toUpperCase()}.`);
        showToast(`SKU ${sku.toUpperCase()} reservado e bloqueado para você!`, 'success');

        applyFilters(); 
    }
}


// script.js

function unlockItem(itemId, sku) {
    const itemIndex = itensEstoque.findIndex(i => i.id == itemId);
    if (itemIndex === -1) {
        showToast('Erro: Item não encontrado para desbloquear.', 'error');
        return;
    }
    
    const item = itensEstoque[itemIndex];

    if (currentUser.username !== item.reservadoPor && currentUser.role !== 'admin-master') {
        showToast(`Ação negada. Apenas o usuário '${item.reservadoPor}' ou um administrador pode desbloquear este item.`, 'error');
        return;
    }

    if (confirm(`Tem certeza que deseja desbloquear o SKU ${sku.toUpperCase()}? A unidade voltará ao estoque.`)) {
        // ======================= INÍCIO DA ALTERAÇÃO =======================
        // Registra a entrada da unidade que está sendo desbloqueada
        registrarTransacao(item.sku, 1, 'DESBLOQUEIO', item.prateleira, `Liberado por ${currentUser.username}`);
        // ======================== FIM DA ALTERAÇÃO =========================

        item.status = 'Disponível';
        item.qtd = 1;
        delete item.reservadoPor; 
        
        saveData();
        logAction(`Item desbloqueado por ${currentUser.username}: SKU ${sku.toUpperCase()}.`);
        showToast(`SKU ${sku.toUpperCase()} desbloqueado e disponível no estoque.`, 'success');

        applyFilters();
    }
}



function updateAvailableShelves() {
    const sku = document.getElementById('mov-sku-terminal').value.trim().toLowerCase();
    const container = document.getElementById('mov-prateleiras-disponiveis');
    const actionSection = document.getElementById('mov-action-section');

    actionSection.classList.add('hidden');
    document.getElementById('mov-prateleira-selecionada').value = '';


    if (!sku) {
        container.innerHTML = '<p class="text-gray-400 text-center p-2">Aguardando SKU...</p>';
        return;
    }

    const shelves = itensEstoque.filter(item => item.sku.toLowerCase() === sku);

    if (shelves.length === 0) {
        container.innerHTML = '<p class="text-red-500 text-center p-2">Nenhuma prateleira encontrada para este SKU.</p>';
    } else {
        container.innerHTML = shelves.map(item => `
            <button onclick="selectShelfForMovement('${item.prateleira}')" class="w-full text-left p-2 mb-1 rounded-md hover:bg-indigo-100 transition-colors flex justify-between items-center">
                <span>Prateleira: <span class="font-bold">${item.prateleira}</span></span>
                <span class="text-sm text-gray-600">Qtd: <span class="font-semibold">${item.qtd}</span></span>
            </button>
        `).join('');
    }
}

function selectShelfForMovement(prateleira) {
    document.getElementById('mov-prateleira-selecionada').value = prateleira;
    document.getElementById('mov-action-section').classList.remove('hidden');
    document.getElementById('mov-qtd-terminal').focus();
}

// script.js

// script.js

// script.js

/**
 * Executa uma movimentação de estoque (Entrada ou Saída) a partir do Terminal de Movimentação Rápida,
 * garantindo que cada ação seja registrada no relatório de transações.
 * @param {'Entrada' | 'Saída'} type - O tipo de movimento a ser executado.
 */
function executeMovement(type) {
    if (!hasPermission('estoque', 'movimentar')) {
        showToast('Permissão negada.', 'error');
        return;
    }
    
    const sku = document.getElementById('mov-sku-terminal').value.trim().toUpperCase();
    const prateleira = document.getElementById('mov-prateleira-selecionada').value.trim().toUpperCase();
    const qtd = parseInt(document.getElementById('mov-qtd-terminal').value);
    
    // Captura a classificação e o motivo
    let classificacao = document.getElementById('mov-classificacao-individual').value;
    let motivo = document.getElementById('mov-motivo-individual').value.trim();

    // --- Validações Iniciais ---
    if (!prateleira || isNaN(qtd) || qtd <= 0) {
        showToast('Selecione uma prateleira e insira uma quantidade válida.', 'error');
        return;
    }
    if (classificacao === 'OUTROS' && !motivo) {
        showToast('Para a classificação "Outros", o motivo é obrigatório.', 'error');
        return;
    }

    const itemIndex = itensEstoque.findIndex(i => i.sku.toUpperCase() === sku && i.prateleira.toUpperCase() === prateleira);

    if (itemIndex === -1 && type === 'Saída') {
        showToast('Ocorreu um erro. O item selecionado para saída não foi encontrado.', 'error');
        return;
    }
    
    // --- Lógica de Movimentação ---
    if (type === 'Entrada') {
        // Verifica a capacidade da prateleira antes de prosseguir
        const { ocupacao, capacidade } = getShelfOcupation(prateleira);
        const novaOcupacao = ocupacao + qtd;

        if (novaOcupacao > capacidade) {
            const confirmMessage = `Atenção: A prateleira ${prateleira} já contém ${ocupacao}/${capacidade} unidades. Adicionar ${qtd} unidade(s) excederá o limite. Deseja continuar mesmo assim?`;
            if (!confirm(confirmMessage)) {
                showToast('Operação cancelada pelo usuário.', 'info');
                return; // Cancela a operação
            }
        }

        if (itemIndex === -1) {
            // Se for entrada e o item não existe na prateleira, cria um novo
            const novoItem = { 
                id: Date.now() + Math.random(), 
                sku, 
                prateleira, 
                capacidade: 25, // Usa o padrão de 25 para novas prateleiras
                qtd: qtd, 
                minStock: ESTOQUE_BAIXO_THRESHOLD, 
                status: 'Disponível' 
            };
            itensEstoque.push(novoItem);
            // Registra a transação como CADASTRO, pois é a primeira vez do item neste local
            registrarTransacao(sku, qtd, 'CADASTRO', prateleira, motivo || 'Cadastro via Terminal');
        } else {
            // Se o item já existe, apenas soma a quantidade
            const item = itensEstoque[itemIndex];
            item.qtd += qtd;
            // Registra a transação como ENTRADA
            registrarTransacao(item.sku, qtd, classificacao, item.prateleira, motivo);
        }

    } else if (type === 'Saída') {
        const item = itensEstoque[itemIndex];
        if (item.qtd < qtd) {
            showToast(`Estoque insuficiente para retirada. Disponível: ${item.qtd}`, 'error');
            return;
        }
        item.qtd -= qtd;
        // Registra a transação de SAÍDA
        registrarTransacao(item.sku, -qtd, classificacao, item.prateleira, motivo);
        
        if (item.qtd === 0) {
            itensEstoque.splice(itemIndex, 1);
            showToast(`Item ${sku} (Prateleira: ${prateleira}) foi removido por ter estoque zerado.`, 'info');
        }
    }

    // --- Finalização e Atualização da UI ---
    showToast(`Movimentação de ${qtd}x ${sku} registrada como ${classificacao}.`, 'success');
    saveData(); // Salva o estado atualizado do estoque e das transações
    applyFilters(); // Atualiza a tabela principal para refletir a mudança
    
    // Limpa os campos do formulário para a próxima operação
    document.getElementById('mov-qtd-terminal').value = '';
    document.getElementById('mov-prateleira-selecionada').value = '';
    document.getElementById('mov-motivo-individual').value = '';
    document.getElementById('mov-action-section').classList.add('hidden');
    updateAvailableShelves(); // Atualiza a lista de prateleiras disponíveis para o SKU
}



function openAdvancedRegistrationModal() {
    const modal = document.getElementById('advanced-registration-modal');
    const modalContent = document.getElementById('modal-content');
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    setTimeout(() => {
        modalContent.classList.remove('scale-95', 'opacity-0');
        modalContent.classList.add('scale-100', 'opacity-100');
    }, 10);
    document.getElementById('advanced-form-container').innerHTML = '';
    addRegistrationRow();
}

function closeAdvancedRegistrationModal() {
    const modal = document.getElementById('advanced-registration-modal');
    const modalContent = document.getElementById('modal-content');
    modalContent.classList.add('scale-95', 'opacity-0');
    modalContent.classList.remove('scale-100', 'opacity-100');
    setTimeout(() => {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }, 200);
}

function addRegistrationRow() {
    const container = document.getElementById('advanced-form-container');
    const rowId = `row-${Date.now()}`;
    const rowHtml = `
        <div class="grid grid-cols-1 md:grid-cols-6 gap-3 items-center p-2 rounded-lg bg-gray-50" id="${rowId}">
            <input type="text" data-field="sku" placeholder="SKU" class="p-2 border rounded-md">
            <input type="text" data-field="prateleira" placeholder="Prateleira" class="p-2 border rounded-md">
            <!-- *** VALOR PADRÃO ALTERADO AQUI *** -->
            <input type="number" data-field="capacidade" placeholder="Capacidade" class="p-2 border rounded-md" value="25">
            <input type="number" data-field="qtd" placeholder="Qtd. Inicial" class="p-2 border rounded-md">
            <input type="number" data-field="minStock" placeholder="Estoque Mín." class="p-2 border rounded-md" value="${ESTOQUE_BAIXO_THRESHOLD}">
            <button onclick="document.getElementById('${rowId}').remove()" class="text-red-500 hover:text-red-700 p-2 bg-red-100 rounded-md">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', rowHtml);
}

function processAdvancedRegistration() {
    if (!hasPermission('estoque', 'cadastrar')) {
        showToast('Permissão negada.', 'error');
        return;
    }
    const rows = document.querySelectorAll('#advanced-form-container > div');
    let itensAdicionados = 0;
    let erros = [];
    let alertasEstoqueBaixo = [];

    rows.forEach((row, index) => {
        const sku = row.querySelector('[data-field="sku"]').value.trim();
        const prateleira = row.querySelector('[data-field="prateleira"]').value.trim();
        const capacidade = parseInt(row.querySelector('[data-field="capacidade"]').value) || 25;
        const qtd = parseInt(row.querySelector('[data-field="qtd"]').value);
        const minStock = parseInt(row.querySelector('[data-field="minStock"]').value) || ESTOQUE_BAIXO_THRESHOLD;
        const { ocupacao, capacidade: capacidadePrateleira } = getShelfOcupation(prateleira);
        
        
        
    // Verifica se a capacidade definida na linha é consistente com a já existente na prateleira
    if (ocupacao > 0 && capacidade !== capacidadePrateleira) {
        erros.push(`Linha ${index + 1} (${sku}): A capacidade (${capacidade}) difere da capacidade já definida para a prateleira ${prateleira} (${capacidadePrateleira}).`);
        return;
    }

    if ((ocupacao + qtd) > capacidadePrateleira) {
        const confirmMessage = `Atenção (Linha ${index + 1}): Adicionar ${qtd}x ${sku} à prateleira ${prateleira} (${ocupacao}/${capacidadePrateleira}) excederá a capacidade. Continuar?`;
        if (!confirm(confirmMessage)) {
            erros.push(`Linha ${index + 1} (${sku}): Operação cancelada devido ao excesso de capacidade.`);
            return;
        }
    }

        if (!sku || !prateleira || isNaN(qtd)) {
            erros.push(`Linha ${index + 1}: SKU, Prateleira e Quantidade são obrigatórios.`);
            return;
        }
        if (qtd > capacidade) {
            erros.push(`Linha ${index + 1} (${sku}): A quantidade (${qtd}) não pode exceder a capacidade (${capacidade}).`);
            return;
        }

        if (qtd <= minStock) {
            alertasEstoqueBaixo.push(`SKU ${sku} na prateleira ${prateleira} foi cadastrado com estoque baixo (${qtd}/${minStock}).`);
        }

        const itemExistente = itensEstoque.find(i => i.sku === sku && i.prateleira === prateleira);

if (itemExistente) {
    // Se já existe, é um AJUSTE ou ENTRADA
    itemExistente.qtd += qtd;
    registrarTransacao(sku, qtd, 'AJUSTE', prateleira, 'Adição de quantidade via Cadastro Avançado');
} else {
    // Se é um item novo, o tipo é CADASTRO
    const id = Date.now() + Math.random();
    itensEstoque.push({ id, sku, prateleira, capacidade, qtd, minStock, status: 'Disponível' });
    // *** LÓGICA APLICADA AQUI ***
    registrarTransacao(sku, qtd, 'CADASTRO', prateleira, 'Cadastro via Formulário Avançado');
}
itensAdicionados++;

    });

    if (erros.length > 0) {
        showToast("Foram encontrados erros no formulário.", 'error');
        alert("Erros encontrados:\n\n" + erros.join("\n"));
    }
    if (alertasEstoqueBaixo.length > 0) {
        alert("Alertas de estoque baixo:\n\n" + alertasEstoqueBaixo.join("\n"));
    }
    if (itensAdicionados > 0) {
        saveData();
        applyFilters();
        const logMessage = `${itensAdicionados} item(ns) foram cadastrados/atualizados no estoque.`;
        logAction(logMessage);
        showToast(logMessage, 'success');
        closeAdvancedRegistrationModal();
    }


    const itemExistente = itensEstoque.find(i => i.sku === sku && i.prateleira === prateleira);
if (itemExistente) {
    // ... lógica existente
} else {
    const id = Date.now() + Math.random();
    // ADICIONE A LINHA DE STATUS AQUI
    itensEstoque.push({ id, sku, prateleira, capacidade, qtd, minStock, status: 'Disponível' }); 
}

}

function loadItens(filters = {}) {
    const table = document.getElementById('itens-table');
    const inventoryContainer = document.getElementById('inventory-container');
    if (!table || !inventoryContainer) return;

    const canDelete = hasPermission('estoque', 'excluir');
    const canReserve = hasPermission('estoque', 'movimentar');

    // Mapa de imagens para acesso rápido
    const imageMap = images.reduce((acc, img) => {
        if (img.nome && img.url) {
            acc[img.nome.toLowerCase()] = img.url;
        }
        return acc;
    }, {});

    // Agrupa dados por SKU
    const skuData = itensEstoque.reduce((acc, item) => {
        const skuKey = item.sku.toLowerCase();
        if (!acc[skuKey]) {
            acc[skuKey] = { total: 0, minStockValues: new Set() };
        }
        acc[skuKey].total += item.qtd;
        acc[skuKey].minStockValues.add(item.minStock);
        return acc;
    }, {});

    const filterSkuInput = (filters.sku || '').toLowerCase().trim();
    const filterStatus = filters.status || '';

    // Lógica de visibilidade do inventário
    if (!filterSkuInput && !filterStatus) {
        inventoryContainer.classList.add('hidden');
        table.innerHTML = '';
        return;
    } else {
        inventoryContainer.classList.remove('hidden');
    }

    const searchTerms = filterSkuInput.split(/[,;\s]+/).filter(s => s);

    let itensFiltrados = itensEstoque.filter(item => {
        if (item.qtd === 0 && item.status !== 'Reservado') return false;

        const itemSkuLower = item.sku.toLowerCase();
        
        let skuMatch = false;
        if (searchTerms.length === 0) {
            skuMatch = true;
        } else {
            skuMatch = searchTerms.some(term => itemSkuLower.startsWith(term));
        }
        
        if (!skuMatch) return false;

        const data = skuData[itemSkuLower];
        if (!data) return false;
        const isLowStock = data.total <= item.minStock;
        const isOverCapacity = item.qtd > item.capacidade;
        let statusMatch = true;
        if (filterStatus === 'ok') statusMatch = !isLowStock && !isOverCapacity && item.status !== 'Reservado';
        if (filterStatus === 'low') statusMatch = isLowStock;
        if (filterStatus === 'over') statusMatch = isOverCapacity;
        if (filterStatus === 'reserved') statusMatch = item.status === 'Reservado';

        return statusMatch;
    });

    const tableHead = `
        <thead class="sticky top-0 bg-gray-100 z-10">
            <tr class="border-b">
                <th class="p-4 text-left w-16">Img</th>
                <th class="p-4 text-left">SKU</th>
                <th class="p-4 text-left">Prateleira</th>
                <th class="p-4 text-left">Capacidade</th>
                <th class="p-4 text-left">Estoque Mín.</th>
                <th class="p-4 text-left">Quantidade</th>
                <th class="p-4 text-left">Status</th>
                <th class="p-4 text-left">Ações</th>
            </tr>
        </thead>`;

    let tableBody = '<tbody>';
    if (itensFiltrados.length === 0) {
        tableBody += `<tr><td colspan="8" class="text-center p-8 text-gray-500">Nenhum item encontrado com os filtros aplicados.</td></tr>`;
    } else {
        itensFiltrados.forEach(item => {
            const data = skuData[item.sku.toLowerCase()];
            const hasInconsistentMinStock = data.minStockValues.size > 1;
            
            let statusClass = 'bg-green-100 text-green-800';
            let statusText = 'OK';
            let rowClass = 'hover:bg-indigo-50';
            
            if (item.status === 'Reservado') {
                statusClass = 'bg-purple-600 text-white font-bold';
                statusText = `BLOQUEADO (${item.reservadoPor})`; 
                rowClass = 'bg-purple-100 font-semibold';
            } else if (data.total <= item.minStock) {
                statusClass = 'bg-yellow-100 text-yellow-800 animate-pulse';
                statusText = 'Estoque Baixo';
            } else if (item.qtd > item.capacidade) {
                statusClass = 'bg-red-100 text-red-800 font-bold';
                statusText = 'Excedido!';
                rowClass = 'bg-red-50';
            }

            const isLocked = item.status === 'Reservado';
            const canUnlock = isLocked && (currentUser.username === item.reservadoPor || currentUser.role === 'admin-master');
            
            let actionButtons = '';
            if (isLocked) {
                if (canUnlock) {
                    actionButtons = `<button onclick="unlockItem('${item.id}', '${item.sku}')" class="bg-green-500 text-white px-3 py-1 rounded-lg text-xs font-semibold hover:bg-green-600" title="Desbloquear item">Desbloquear</button>`;
                }
            } else {
                if (canDelete) {
                    actionButtons += `<button onclick="deleteItem('${item.id}')" class="text-gray-400 hover:text-red-600 mr-4" title="Excluir"><i class="fas fa-trash"></i></button>`;
                }
                if (canReserve && data.total === 1) {
                    actionButtons += `<button onclick="reserveItem('${item.id}', '${item.sku}')" class="bg-indigo-500 text-white px-3 py-1 rounded-lg text-xs font-semibold hover:bg-indigo-600" title="Reservar última unidade">Reservar</button>`;
                }
            }

            const editableClass = !isLocked ? 'editable' : '';
            const ondblclick = !isLocked ? 'ondblclick' : '';

            // *** ALTERAÇÃO APLICADA AQUI ***
            const itemSkuLower = item.sku.toLowerCase();
            const imageUrl = imageMap[itemSkuLower] || CAMINHO_IMAGEM_TESTE; // Usa a imagem de teste se não encontrar
            let imageCellHtml = `
                <td class="p-4 text-center">
                    <button onclick="openImageZoomModal('${imageUrl}')" class="text-indigo-500 hover:text-indigo-700 text-xl" title="Clique para ampliar a imagem">
                        <i class="fas fa-camera"></i>
                    </button>
                </td>`;

            tableBody += `
                <tr data-id="${item.id}" class="border-b border-gray-200 transition-colors duration-200 ${rowClass}">
                    ${imageCellHtml}
                    <td class="p-4 font-semibold text-gray-800">${item.sku}</td>
                    <td class="p-4 text-gray-600 ${editableClass}" ${ondblclick}="editCell(this, '${item.id}', 'prateleira')">${item.prateleira}</td>
                    <td class="p-4 text-gray-600 ${editableClass}" ${ondblclick}="editCell(this, '${item.id}', 'capacidade')">${item.capacidade}</td>
                    <td class="p-4 text-gray-600 ${editableClass}" ${ondblclick}="editCell(this, '${item.id}', 'minStock')">
                        ${item.minStock}
                        ${hasInconsistentMinStock ? '<i class="fas fa-exclamation-triangle text-orange-500 ml-2" title="Alerta: Valores de Estoque Mín. diferentes para este SKU!"></i>' : ''}
                    </td>
                    <td class="p-4 font-bold text-lg ${isLocked ? 'text-purple-600' : 'text-indigo-600'} ${editableClass}" ${ondblclick}="editCell(this, '${item.id}', 'qtd')">${item.qtd}</td>
                    <td class="p-4"><span class="px-3 py-1 rounded-full text-xs font-semibold ${statusClass}">${statusText}</span></td>
                    <td class="p-4">${actionButtons || '<span class="text-xs text-gray-400">-</span>'}</td>
                </tr>`;
        });
    }
    tableBody += '</tbody>';
    table.innerHTML = tableHead + tableBody;
}
    


// script.js

// =================================================================================
// FUNÇÕES DO MODAL DE ZOOM DE IMAGEM
// =================================================================================
function openImageZoomModal(imageUrl) {
    const modal = document.getElementById('image-zoom-modal');
    const zoomedImage = document.getElementById('zoomed-image');

    if (!imageUrl) {
        // Se, por algum motivo, a URL for inválida, mostra uma imagem padrão.
        zoomedImage.src = 'https://via.placeholder.com/600x400.png?text=Imagem+Não+Disponível';
    } else {
        zoomedImage.src = imageUrl;
    }
    
    modal.classList.remove('hidden' );
    document.body.classList.add('overflow-hidden'); // Impede o scroll da página ao fundo
}

function closeImageZoomModal() {
    const modal = document.getElementById('image-zoom-modal');
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}





// script.js

function editCell(cell, id, field) {
    if (!hasPermission('estoque', 'editar')) return;
    if (document.querySelector('.edit-input-wrapper')) {
        showToast("Termine a edição atual antes de iniciar outra.", 'info');
        return;
    }

    const originalValue = cell.innerText;
    const item = itensEstoque.find(i => i.id == id);
    if (!item) return; // Segurança: não faz nada se o item não for encontrado

    const inputType = (field !== 'prateleira') ? 'number' : 'text';

    cell.innerHTML = `
        <div class="edit-input-wrapper flex items-center gap-2 p-1 bg-yellow-100 rounded-md">
            <input type="${inputType}" value="${originalValue}" class="w-full p-1 border-2 border-indigo-400 rounded focus:outline-none">
            <button class="save-btn text-green-600 hover:text-green-800"><i class="fas fa-check"></i></button>
            <button class="cancel-btn text-red-600 hover:text-red-800"><i class="fas fa-times"></i></button>
        </div>
    `;
    const wrapper = cell.querySelector('.edit-input-wrapper');
    const input = wrapper.querySelector('input');
    input.focus();
    input.select();

    const cleanup = () => {
        applyFilters();
    };

    const saveChanges = () => {
        const originalValue = cell.innerText;
        const input = wrapper.querySelector('input');
        const newValue = input.value.trim();
        let processedValue = (inputType === 'number') ? parseInt(newValue) : newValue;


        if (newValue === '' || (inputType === 'number' && isNaN(processedValue))) {
            showToast("Valor inválido.", 'error');
            return;
        }
        if (field === 'qtd' && processedValue > item.capacidade) {
            if (!confirm(`A quantidade (${processedValue}) excede a capacidade (${item.capacidade}). Continuar?`)) return;
        }
        if (field === 'capacidade' && processedValue < item.qtd) {
            showToast(`A capacidade (${processedValue}) não pode ser menor que a quantidade em estoque (${item.qtd}).`, 'error');
            return;
        }

        const valorAntigo = item[field];
        const diferenca = processedValue - parseInt(originalValue);

       if (processedValue != valorAntigo) {
    
    // Atualiza o dado mestre primeiro para garantir consistência
    item[field] = processedValue;

    if (field === 'qtd') {
        const diferenca = processedValue - parseInt(originalValue);
        registrarTransacao(item.sku, diferenca, 'AJUSTE', item.prateleira, `Edição manual de ${valorAntigo} para ${processedValue}`);
    } else {
        // *** A CORREÇÃO ESTÁ AQUI ***
        // Determina qual prateleira registrar na transação.
        // Se o campo editado foi 'prateleira', usamos o novo valor.
        // Se foi outro campo (como capacidade), usamos a prateleira existente do item.
        const prateleiraParaRegistro = (field === 'prateleira') ? processedValue : item.prateleira;
        
        const motivoEdicao = `${field.charAt(0).toUpperCase() + field.slice(1)} alterada de '${valorAntigo}' para '${processedValue}'`;
        
        // Registra a transação com a prateleira correta.
        registrarTransacao(item.sku, 0, 'EDIÇÃO', prateleiraParaRegistro, motivoEdicao);
    }

    // Salva os dados atualizados
    saveData();
    logAction(`Item ${item.sku} editado: ${motivoEdicao}`);
    showToast('Item atualizado!', 'success');
}

        
        cleanup(); // Atualiza a visualização da tabela
    };


    const handleKeydown = (e) => {
        if (e.key === 'Enter') saveChanges();
        if (e.key === 'Escape') cancelChanges();
    };

    wrapper.querySelector('.save-btn').addEventListener('click', saveChanges);
    wrapper.querySelector('.cancel-btn').addEventListener('click', cancelChanges);
    wrapper.addEventListener('keydown', handleKeydown);
}


// script.js

function deleteItem(id) {
    if (!hasPermission('estoque', 'excluir')) return;
    const itemIndex = itensEstoque.findIndex(i => i.id == id);
    if (itemIndex === -1) return;
    
    const item = itensEstoque[itemIndex];
    
    if (confirm(`Tem certeza que deseja excluir o item ${item.sku} da prateleira ${item.prateleira}?`)) {
        // ======================= INÍCIO DA ALTERAÇÃO =======================
        // Registra a saída de TODAS as unidades do item antes de excluí-lo
        if (item.qtd > 0) {
            registrarTransacao(item.sku, -item.qtd, 'EXCLUSÃO', item.prateleira, 'Item removido manualmente');
        }
        // ======================== FIM DA ALTERAÇÃO =========================

        itensEstoque.splice(itemIndex, 1);
        saveData();
        applyFilters();
logAction({
    acao: 'Item de estoque excluído',
    modulo: 'Estoque',
    funcao: 'deleteItem',
    detalhes: { sku: item.sku, prateleira: item.prateleira, qtd_removida: item.qtd }
});
        showToast('Item excluído.', 'success');
    }
}


// =================================================================================
// NOVAS FUNÇÕES PARA MOVIMENTAÇÃO EM MASSA
// =================================================================================

function switchMovementMode(mode) {
    const terminalIndividual = document.getElementById('terminal-individual');
    const terminalMassa = document.getElementById('terminal-massa');
    const btnIndividual = document.getElementById('mode-individual');
    const btnMassa = document.getElementById('mode-massa');
    const description = document.getElementById('terminal-description');

    if (mode === 'individual') {
        terminalIndividual.classList.remove('hidden');
        terminalMassa.classList.add('hidden');
        btnIndividual.classList.add('bg-white', 'shadow', 'font-semibold');
        btnIndividual.classList.remove('text-gray-600');
        btnMassa.classList.remove('bg-white', 'shadow', 'font-semibold');
        btnMassa.classList.add('text-gray-600');
        description.innerText = "Digite o SKU para ver as prateleiras disponíveis e realizar a movimentação.";
    } else { // modo 'massa'
        terminalIndividual.classList.add('hidden');
        terminalMassa.classList.remove('hidden');
        btnMassa.classList.add('bg-white', 'shadow', 'font-semibold');
        btnMassa.classList.remove('text-gray-600');
        btnIndividual.classList.remove('bg-white', 'shadow', 'font-semibold');
        btnIndividual.classList.add('text-gray-600');
        description.innerText = "Cole uma lista de SKUs para dar baixa em lote de uma prateleira específica.";
    }
}

function executeBulkMovement() {
    if (!hasPermission('estoque', 'movimentar')) {
        showToast('Permissão negada.', 'error');
        return;
    }

    const skusText = document.getElementById('mov-skus-massa').value.trim();
    const prateleira = document.getElementById('mov-prateleira-massa').value.trim();

    if (!skusText || !prateleira) {
        showToast('Preencha a lista de SKUs e a prateleira de origem.', 'error');
        return;
    }

    // Converte o texto em uma lista de SKUs, removendo linhas vazias e espaços.
    const skusParaRetirar = skusText.split('\n').map(s => s.trim()).filter(s => s !== '');
    
    let sucessos = 0;
    let falhas = [];

    skusParaRetirar.forEach(sku => {
        // Para cada SKU, a quantidade a ser retirada é 1.
        const qtd = 1; 
        const itemIndex = itensEstoque.findIndex(i => i.sku.toLowerCase() === sku.toLowerCase() && i.prateleira.toLowerCase() === prateleira.toLowerCase());

        if (itemIndex === -1) {
            falhas.push(`SKU ${sku} não encontrado na prateleira ${prateleira}.`);
        } else {
            const item = itensEstoque[itemIndex];
            if (item.qtd < qtd) {
                falhas.push(`Estoque insuficiente para SKU ${sku} na prateleira ${prateleira}.`);
            } else {
                item.qtd -= qtd;
                sucessos++;
                logAction(`Retirada em massa: 1 un. do SKU ${sku} da prateleira ${prateleira}.`);
                
                // Remove o item se o estoque zerar
                if (item.qtd === 0) {
                    itensEstoque.splice(itemIndex, 1);
                }
            }
        }
    });

    saveData();
    applyFilters(); // Atualiza a tabela principal

    // Feedback para o usuário
    if (sucessos > 0) {
        showToast(`${sucessos} item(ns) retirado(s) com sucesso!`, 'success');
    }
    if (falhas.length > 0) {
        showToast(`${falhas.length} item(ns) não puderam ser retirados.`, 'error');
        // Exibe um alerta com os detalhes dos erros
        setTimeout(() => alert("Ocorreram os seguintes erros:\n\n- " + falhas.join("\n- ")), 100);
    }

    // Limpa os campos após a operação
    document.getElementById('mov-skus-massa').value = '';
    document.getElementById('mov-prateleira-massa').value = '';
}




// =================================================================================
// NOVA FUNÇÃO PARA MOVIMENTAÇÃO EM MASSA AVANÇADA
// =================================================================================

// script.js

/**
 * Executa movimentações de ENTRADA ou SAÍDA em massa com base nos dados do terminal.
 */
function executeBulkMovementAdvanced() {
    if (!hasPermission('estoque', 'movimentar')) {
        showToast('Permissão negada.', 'error');
        return;
    }

    // CAPTURA TODOS OS DADOS DO FORMULÁRIO
    const dadosEmMassa = document.getElementById('mov-dados-massa').value.trim();
    const tipoOperacao = document.getElementById('mov-tipo-operacao-massa').value; // 'ENTRADA' ou 'SAIDA'
    const classificacao = document.getElementById('mov-classificacao-massa').value;
    const motivo = document.getElementById('mov-motivo-massa').value.trim();

    // VALIDAÇÕES INICIAIS
    if (!dadosEmMassa) {
        showToast('A área de dados está vazia. Cole os itens para movimentar.', 'error');
        return;
    }
    if (classificacao === 'OUTROS' && !motivo) {
        showToast('Para a classificação "Outros", o motivo é obrigatório.', 'error');
        return;
    }

    const linhas = dadosEmMassa.split('\n').filter(linha => linha.trim() !== '');
    let falhas = [];
    let validacaoOk = true;

    // =======================================================================
    // PASSAGEM DE VALIDAÇÃO (AGORA CONSIDERA ENTRADA E SAÍDA)
    // =======================================================================
    for (const [index, linha] of linhas.entries()) {
        const partes = linha.split(',').map(p => p.trim());
        if (partes.length !== 3) {
            falhas.push(`Linha ${index + 1}: Formato inválido. Use SKU,PRATELEIRA,QUANTIDADE.`);
            validacaoOk = false;
            continue;
        }

        const [sku, prateleira, qtdStr] = partes;
        const qtd = parseInt(qtdStr);

        if (!sku || !prateleira || isNaN(qtd) || qtd <= 0) {
            falhas.push(`Linha ${index + 1} (${sku}): Dados inválidos ou quantidade zerada.`);
            validacaoOk = false;
            continue;
        }

        // Para SAÍDAS, o item DEVE existir e ter estoque suficiente.
        if (tipoOperacao === 'SAIDA') {
            const item = itensEstoque.find(i => i.sku.toLowerCase() === sku.toLowerCase() && i.prateleira.toLowerCase() === prateleira.toLowerCase());
            if (!item) {
                falhas.push(`Linha ${index + 1}: SKU ${sku} não encontrado na prateleira ${prateleira} para dar baixa.`);
                validacaoOk = false;
            } else if (item.qtd < qtd) {
                falhas.push(`Linha ${index + 1}: Estoque insuficiente para SKU ${sku} (Disponível: ${item.qtd}, Solicitado: ${qtd}).`);
                validacaoOk = false;
            }
        }
        // Para ENTRADAS, não há validação de estoque prévio necessária. O item pode ou não existir.
    }

    if (!validacaoOk) {
        showToast('Foram encontrados erros na sua lista. Nenhuma movimentação foi realizada.', 'error');
        alert("Corrija os seguintes erros antes de continuar:\n\n- " + falhas.join("\n- "));
        return;
    }

    // =======================================================================
    // PASSAGEM DE EXECUÇÃO (SE A VALIDAÇÃO PASSOU)
    // =======================================================================
    let sucessos = 0;
    linhas.forEach(linha => {
        const [sku, prateleira, qtdStr] = linha.split(',').map(p => p.trim());
        const qtd = parseInt(qtdStr);

        const itemIndex = itensEstoque.findIndex(i => i.sku.toLowerCase() === sku.toLowerCase() && i.prateleira.toLowerCase() === prateleira.toLowerCase());

        if (tipoOperacao === 'SAIDA') {
            if (itemIndex !== -1) {
                itensEstoque[itemIndex].qtd -= qtd;
                registrarTransacao(sku, -qtd, classificacao, prateleira, motivo);
                if (itensEstoque[itemIndex].qtd === 0) {
                    itensEstoque.splice(itemIndex, 1);
                }
                sucessos++;
            }
        } else { // tipoOperacao === 'ENTRADA'
    if (itemIndex !== -1) {
        // ... (soma a quantidade)
    } else {
        // Item não existe, cria um novo com o padrão de capacidade
        itensEstoque.push({
            id: Date.now() + Math.random(),
            sku: sku.toUpperCase(),
            prateleira: prateleira.toUpperCase(),
            // *** VALOR PADRÃO ALTERADO AQUI ***
            capacidade: 25, 
            qtd: qtd,
            minStock: 10, 
            status: 'Disponível'
        });
    }
            registrarTransacao(sku, qtd, classificacao, prateleira, motivo);
            sucessos++;
        }
    });

    localStorage.setItem('saas_transacoesEstoque', JSON.stringify(transacoesEstoque));
    saveData();
    applyFilters();

    const operacaoTexto = tipoOperacao === 'ENTRADA' ? 'entradas' : 'baixas';
    showToast(`${sucessos} movimentações de ${operacaoTexto} (${classificacao}) realizadas com sucesso!`, 'success');
    document.getElementById('mov-dados-massa').value = '';
    document.getElementById('mov-motivo-massa').value = '';
}






function generateStockReport() {
    if (!hasPermission('estoque', 'visualizar')) {
        showToast('Permissão negada.', 'error');
        return;
    }
    if (itensEstoque.length === 0) {
        showToast("Não há itens para gerar um relatório.", 'info');
        return;
    }
    let csvContent = "data:text/csv;charset=utf-8,";
    const headers = ["SKU", "Prateleira", "Quantidade", "Capacidade", "Estoque Minimo", "Status"];
    csvContent += headers.join(",") + "\r\n";
    itensEstoque.forEach(item => {
        let status = "OK";
        if (item.qtd <= item.minStock) status = "Estoque Baixo";
        if (item.qtd > item.capacidade) status = "Capacidade Excedida";
        const row = [item.sku, item.prateleira, item.qtd, item.capacidade, item.minStock, status];
        csvContent += row.join(",") + "\r\n";
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const timestamp = new Date().toISOString().slice(0, 10);
    link.setAttribute("download", `relatorio_estoque_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    const logMessage = "Relatório de estoque gerado e baixado.";
    logAction(logMessage);
    showToast(logMessage, 'success');
}


// script.js

/**
 * Calcula a ocupação atual e a capacidade de uma prateleira.
 * @param {string} prateleira - O nome da prateleira a ser verificada.
 * @returns {{ocupacao: number, capacidade: number}}
 */
function getShelfOcupation(prateleira) {
    const itensNaPrateleira = itensEstoque.filter(i => i.prateleira.toUpperCase() === prateleira.toUpperCase());
    
    if (itensNaPrateleira.length === 0) {
        return { ocupacao: 0, capacidade: Infinity }; // Prateleira vazia, capacidade "infinita" até ser definida
    }

    const ocupacao = itensNaPrateleira.reduce((total, item) => total + item.qtd, 0);
    // Assume que a capacidade é a mesma para todos os itens na mesma prateleira. Pega a do primeiro.
    const capacidade = itensNaPrateleira[0].capacidade;

    return { ocupacao, capacidade };
}





/**
 * Mostra a aba do marketplace selecionado e oculta as outras.
 * @param {'ml' | 'shopee'} marketplace - O identificador do marketplace a ser exibido.
 */
function showTab(marketplace) {
    // Oculta todos os conteúdos das abas
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });

    // Remove a classe de 'ativo' de todos os botões de aba
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('border-indigo-600', 'text-indigo-600');
        btn.classList.add('border-transparent', 'text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');
    });

    // Mostra o conteúdo da aba selecionada
    const contentToShow = document.getElementById(`pedidos-${marketplace}-section`);
    if (contentToShow) {
        contentToShow.classList.remove('hidden');
    }

    // Adiciona a classe de 'ativo' ao botão da aba selecionada
    const btnToActivate = document.getElementById(`tab-${marketplace}`);
    if (btnToActivate) {
        btnToActivate.classList.add('border-indigo-600', 'text-indigo-600');
        btnToActivate.classList.remove('border-transparent', 'text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');
    }
}


//=================================================================================
// FUNÇÃO limparSku
//=================================================================================

/**
 * Limpa um SKU de acordo com regras específicas:
 * - Mantém sufixos especiais de produto (ex: -VF, -100, -999).
 * - Remove sufixos de variação de letra (ex: -C, -P, -F, -V).
 * - Remove sufixos numéricos não especiais (ex: -150, -200).
 * @param {string} skuOriginal - O SKU a ser limpo.
 * @returns {string} O SKU limpo.
 */
function limparSku(skuOriginal) {
    if (!skuOriginal) {
        return "";
    }

    const sku = skuOriginal.trim().toUpperCase();

    // Lista de sufixos especiais que DEVEM ser mantidos.
    const sufixosEspeciais = ['-999', '-100', '-VF', '-130', '-350', '-175'];

    // 1. Verifica se o SKU termina com algum dos sufixos especiais.
    const temSufixoEspecial = sufixosEspeciais.some(sufixo => sku.endsWith(sufixo));

    if (temSufixoEspecial) {
        // Se for um SKU especial, retorna como está.
        // Ex: "PVGL001-VF" -> retorna "PVGL001-VF"
        return sku;
    }

    // 2. Se não for especial, remove os sufixos de variação de letra (-C, -P, -F, -V).
    let skuLimpo = sku.replace(/-(C|P|F|V)$/, '');

    // 3. *** NOVA REGRA ADICIONADA AQUI ***
    // Em seguida, remove qualquer outro sufixo numérico (como -150).
    // A regex /-\d+$/ procura por um hífen seguido de um ou mais números no final da string.
    skuLimpo = skuLimpo.replace(/-\d+$/, '');

    // Ex: "PCRV029-150" -> vira "PCRV029"
    // Ex: "PCRV029-F" -> vira "PCRV029"
    return skuLimpo;
}


//=================================================================================
// SUBSTITUA ESTA FUNÇÃO NO SEU SCRIPT.JS
//=================================================================================
function parseShopeeTexto(text) {
    const pedidosValidos = [];
    const pedidosCancelados = [];
    const erros = [];

    const blocos = text.split(/(?=^(BR\d{13}[A-Z]|[a-z0-9]{4,}))/m).filter(b => b.trim() && b.includes('ID do Pedido'));

    blocos.forEach((bloco, index) => {
        const idMatch = bloco.match(/ID do Pedido\s*([A-Z0-9]+)/);
        const idPedido = idMatch ? `#${idMatch[1]}` : `SHOPEE-ERR-${Date.now() + index}`;
        const isCanceled = bloco.toLowerCase().includes('pedido cancelado');

        let dataColeta = new Date().toLocaleDateString('pt-BR');
        const dataMatch = bloco.match(/Coleta do pacote a partir de (\d{2}\/\d{2}\/\d{4})/);
        if (dataMatch) {
            dataColeta = dataMatch[1];
        }
        const tipoEntrega = bloco.includes('Coleta do pacote a partir de') ? 'Coleta' : 'Postagem / Coleta';

        const regexItem = /^(.*?)\n(?:Variação:.*?\n)?.*?(\[.*?\])\n(x\d+)/gms;
        let match;
        const itensEncontrados = [];

        while ((match = regexItem.exec(bloco)) !== null) {
            const skuBruto = match[2];
            const quantidadeBruta = match[3];
            const partesSku = skuBruto.match(/\[(.*?)\]/)[1].trim().split(/\s+/).filter(s => s);
            const skuOriginal = partesSku.length > 1 ? partesSku[1] : partesSku[0];
            
            // *** LÓGICA CENTRALIZADA APLICADA AQUI ***
            const skuFinal = limparSku(skuOriginal); 

            const quantidadeFinal = parseInt(quantidadeBruta.replace('x', ''), 10) || 1;
            if (skuFinal) {
                itensEncontrados.push({ sku: skuFinal, quantidade: quantidadeFinal });
            }
        }
        
        if (itensEncontrados.length === 0) {
            const skuMatch = bloco.match(/\[(.*?)\]/);
            const qtdMatch = bloco.match(/^(x\d+)/m);
            if (skuMatch) {
                const partesSku = skuMatch[1].trim().split(/\s+/).filter(s => s);
                const skuOriginal = partesSku.length > 1 ? partesSku[1] : partesSku[0];
                
                // *** LÓGICA CENTRALIZADA APLICADA AQUI ***
                const skuFinal = limparSku(skuOriginal);

                const quantidadeFinal = qtdMatch ? parseInt(qtdMatch[1].replace('x', ''), 10) : 1;
                if (skuFinal) {
                    itensEncontrados.push({ sku: skuFinal, quantidade: quantidadeFinal });
                }
            }
        }

        if (itensEncontrados.length === 0 && !isCanceled) {
            erros.push({ id: idPedido, motivo: 'Não foi possível extrair nenhum item com SKU deste bloco.' });
            return;
        }

        itensEncontrados.forEach(item => {
            const pedidoData = {
                id: idPedido,
                marketplace: 'Shopee',
                dataColeta,
                tipoEntrega,
                sku: item.sku,
                quantidade: item.quantidade,
                status: isCanceled ? 'Cancelado' : 'Pendente',
                dataImportacao: new Date().toISOString()
            };
            if (isCanceled) {
                pedidosCancelados.push(pedidoData);
            } else {
                pedidosValidos.push(pedidoData);
            }
        });
    });

    return { pedidosValidos, pedidosCancelados, pedidosComErro: erros };
}









// =================================================================================
// PROCESSAMENTO DE PEDIDOS DA SHOPEE (FUNÇÃO ATUALIZADA)
// =================================================================================

/**
 * Aciona o upload de arquivo TXT para pedidos da Shopee.
 */
function triggerShopeeUpload() {
    if (!hasPermission('pedidos', 'importar')) {
        showToast('Permissão negada para importar pedidos.', 'error');
        return;
    }
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.txt';
    fileInput.onchange = (event) => {
        const file = event.target.files[0];
        if (file) processShopeeTxt(file);
    };
    fileInput.click();
}

// =================================================================================
// PROCESSAMENTO DE PEDIDOS DA SHOPEE (VERSÃO CORRIGIDA E ROBUSTA)
// =================================================================================

/**
 * Processa o arquivo TXT de pedidos da Shopee e importa para o sistema.
 * Esta versão é mais robusta para lidar com variações no formato do arquivo.
 * @param {File} file - O arquivo TXT carregado.
 */
async function processShopeeTxt(file) {
    try {
        const content = await file.text();
        // Quebra o conteúdo em "blocos de pedido". Cada bloco começa com o nome do comprador.
        // Isso torna o processamento mais isolado e menos propenso a erros.
        const blocos = content.split(/(?=^[^A-Z\d\s].*$)/m).filter(b => b.trim() !== '');

        let pedidosImportados = [];
        let errosDeProcessamento = [];

        blocos.forEach((bloco, index) => {
            const linhas = bloco.split('\n').map(l => l.trim()).filter(l => l);
            if (linhas.length < 3) return; // Bloco inválido

            const comprador = linhas[0];
            const idMatch = bloco.match(/ID do Pedido\s*([A-Z0-9]+)/);
            const idPedido = idMatch ? `#${idMatch[1]}` : `SHOPEE-ERR-${index}`;

            // Encontra as linhas que representam os itens do pedido
            let itensDoBloco = [];
            let itemAtual = null;

            for (const linha of linhas) {
                // Se a linha parece ser a descrição de um produto...
                if (linha.length > 5 && !linha.startsWith('Variação:') && !linha.startsWith('x') && !linha.startsWith('R$') && !/ID do Pedido|Pagamento|Status|Prazo|Canal/.test(linha)) {
                    // Se já havia um item sendo processado, salva-o antes de começar um novo
                    if (itemAtual && itemAtual.sku) {
                        itensDoBloco.push(itemAtual);
                    }
                    itemAtual = { descricao: linha, quantidade: 1, sku: null }; // Inicia um novo item
                }
                // Se a linha é a variação e temos um item ativo...
                else if (linha.startsWith('Variação:') && itemAtual) {
                    const skuMatch = linha.match(/\[(.*?)\]/);
                    if (skuMatch) {
                        const skus = skuMatch[1].trim().split(' ');
                        itemAtual.sku = skus.length > 1 ? skus[skus.length - 1] : skus[0];
                    } else {
                        itemAtual.sku = "SKU-NAO-ENCONTRADO";
                    }
                }
                // Se a linha é a quantidade e temos um item ativo...
                else if (linha.startsWith('x') && itemAtual) {
                    itemAtual.quantidade = parseInt(linha.replace('x', ''), 10) || 1;
                }
            }
            // Salva o último item que estava sendo processado
            if (itemAtual && itemAtual.sku) {
                itensDoBloco.push(itemAtual);
            }

            // Se não encontrou nenhum item válido no bloco, registra um erro
            if (itensDoBloco.length === 0) {
                errosDeProcessamento.push(`Não foi possível extrair itens do pedido para o comprador: ${comprador}`);
                return; // Pula para o próximo bloco
            }

            // Para cada item extraído, cria um "pedido" individual, como no Mercado Livre
            itensDoBloco.forEach(item => {
                const pedidoData = {
                    id: idPedido,
                    marketplace: 'Shopee',
                    dataColeta: new Date().toLocaleDateString('pt-BR'), // Data padrão, pode ser ajustada se encontrada no TXT
                    tipoEntrega: 'Coleta', // Padrão
                    sku: item.sku,
                    quantidade: item.quantidade,
                    status: 'Pendente',
                    dataImportacao: new Date().toISOString()
                };
                pedidosImportados.push(pedidoData);
            });
        });

        if (pedidosImportados.length > 0) {
            // Adiciona os novos pedidos à lista principal
            pedidos.push(...pedidosImportados);
            saveData();
            loadPedidos(); // Recarrega a tela principal de pedidos
            showToast(`${pedidosImportados.length} itens de pedidos da Shopee importados com sucesso!`, 'success');
            logAction(`Importados ${pedidosImportados.length} itens de pedidos da Shopee do arquivo ${file.name}.`);
        } else {
            showToast('Nenhum pedido válido encontrado no arquivo TXT.', 'info');
        }

        // Se houver erros, exibe um alerta
        if (errosDeProcessamento.length > 0) {
            setTimeout(() => {
                alert("Atenção: Alguns blocos de pedido não puderam ser processados:\n\n- " + errosDeProcessamento.join('\n- '));
            }, 500);
        }

    } catch (error) {
        console.error('Erro crítico ao processar TXT da Shopee:', error);
        showToast('Ocorreu um erro inesperado ao ler o arquivo. Verifique o console para detalhes.', 'error');
    }
}







// =================================================================================
// MÓDULO DE PEDIDOS (FUNÇÃO PRINCIPAL ATUALIZADA)
// =================================================================================



function addPedido() {
    if (!hasPermission('pedidos', 'cadastrar')) {
        showToast('Permissão negada.', 'error');
        return;
    }
    const cliente = document.getElementById('pedido-cliente').value;
    const itens = document.getElementById('pedido-itens').value;
    if (!cliente || !itens) {
        showToast('Preencha o cliente e os itens do pedido.', 'error');
        return;
    }
    const novoPedido = {
        id: `PED-${Date.now()}`,
        cliente,
        itens: itens.split(','),
        data: new Date()
    };
    pedidos.push(novoPedido);
    saveData();
    logAction(`Novo pedido cadastrado: ${novoPedido.id} para ${cliente}`);
    showToast('Pedido cadastrado com sucesso!', 'success');
    loadPedidos();
    document.getElementById('pedido-cliente').value = '';
    document.getElementById('pedido-itens').value = '';
}

function deletePedido(index) {
    if (!hasPermission('pedidos', 'excluir')) {
        showToast('Permissão negada.', 'error');
        return;
    }
    const pedidoId = pedidos[index].id;
    if (confirm(`Tem certeza que deseja excluir o pedido ${pedidoId}?`)) {
        pedidos.splice(index, 1);
        saveData();
        logAction(`Pedido ${pedidoId} excluído.`);
        showToast('Pedido excluído.', 'success');
        loadPedidos();
    }
}

// =================================================================================
// MÓDULO BANCO DE IMAGENS
// =================================================================================
function loadBancoImagens() {
    if (!hasPermission('bancoImagens', 'visualizar')) return;
    const gallery = document.getElementById('image-gallery');
    if (!gallery) return;
    gallery.innerHTML = '';
    images.forEach((img, index) => {
        gallery.innerHTML += `
            <div class="relative group bg-gray-100 rounded-lg overflow-hidden shadow-md">
                <img src="${img.url}" alt="${img.nome}" class="w-full h-48 object-cover">
                <div class="p-3">
                    <p class="font-semibold truncate">${img.nome}</p>
                </div>
                <div class="absolute top-2 right-2">
                    <button onclick="deleteImage(${index})" class="bg-red-500 text-white w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" data-permission="bancoImagens:excluir">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });
    applyPermissionsToUI();
}

function addImage() {
    if (!hasPermission('bancoImagens', 'adicionar')) {
        showToast('Permissão negada.', 'error');
        return;
    }
    const nome = document.getElementById('img-nome').value;
    const url = document.getElementById('img-url').value;
    if (!nome || !url) {
        showToast('Preencha o nome e a URL da imagem.', 'error');
        return;
    }
    const novaImagem = { id: `IMG-${Date.now()}`, nome, url };
    images.push(novaImagem);
    saveData();
    logAction(`Nova imagem adicionada: ${nome}`);
    showToast('Imagem adicionada com sucesso!', 'success');
    loadBancoImagens();
    document.getElementById('img-nome').value = '';
    document.getElementById('img-url').value = '';
}

function deleteImage(index) {
    if (!hasPermission('bancoImagens', 'excluir')) {
        showToast('Permissão negada.', 'error');
        return;
    }
    const imgName = images[index].nome;
    if (confirm(`Tem certeza que deseja excluir a imagem "${imgName}"?`)) {
        images.splice(index, 1);
        saveData();
        logAction(`Imagem "${imgName}" excluída.`);
        showToast('Imagem excluída.', 'success');
        loadBancoImagens();
    }
}



// =================================================================================
// MÓDULO BANCO DE IMAGENS - IMPLEMENTAÇÃO DA BUSCA
// =================================================================================

/**
 * Função principal que é chamada pelo botão "Procurar".
 * Ela lê os SKUs, busca no "servidor" (localStorage) e exibe os resultados.
 */
function procurarImagensServidor() {
    // Verifica a permissão do usuário para visualizar o banco de imagens.
    if (!hasPermission('bancoImagens', 'visualizar')) {
        showToast('Você não tem permissão para acessar o banco de imagens.', 'error');
        return;
    }

    const inputEl = document.getElementById('image-search-input');
    const skusInput = inputEl.value.trim();

    if (!skusInput) {
        showToast('Por favor, digite pelo menos um SKU para pesquisar.', 'info');
        return;
    }

    // Converte o texto de entrada em uma lista limpa de SKUs, tratando vírgulas, espaços e quebras de linha.
    const skusParaBuscar = skusInput.split(/[\s,]+/).filter(sku => sku.trim() !== '').map(sku => sku.toUpperCase());

    const resultados = {
        encontrados: [],
        naoEncontrados: []
    };

    // Simula a busca no servidor, iterando sobre a lista de SKUs.
    skusParaBuscar.forEach(sku => {
        // Busca no array 'images' (nosso "servidor" de imagens).
        const imagemEncontrada = images.find(img => img.nome.toUpperCase() === sku);

        if (imagemEncontrada) {
            resultados.encontrados.push(imagemEncontrada);
        } else {
            resultados.naoEncontrados.push(sku);
        }
    });

    // Exibe os resultados na tela.
    renderizarResultadosBuscaImagens(resultados);
    logAction(`Busca de imagens realizada para ${skusParaBuscar.length} SKUs.`);
}

/**
 * Renderiza os resultados da busca (imagens encontradas e erros) na interface.
 * @param {object} resultados - Um objeto contendo as listas de imagens encontradas e SKUs não encontrados.
 */
function renderizarResultadosBuscaImagens(resultados) {
    const resultsSection = document.getElementById('image-results-section');
    const errorsContainer = document.getElementById('image-errors-container');
    const tempFolder = document.getElementById('image-temp-folder');

    // Limpa os resultados anteriores.
    errorsContainer.innerHTML = '';
    tempFolder.innerHTML = '';

    // Mostra a seção de resultados.
    resultsSection.classList.remove('hidden');

    // 1. Renderiza os erros (SKUs não encontrados).
    if (resultados.naoEncontrados.length > 0) {
        const skusNaoEncontrados = resultados.naoEncontrados.join(', ');
        errorsContainer.innerHTML = `
            <div class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-r-lg shadow-md" role="alert">
                <p class="font-bold">Erro na Busca</p>
                <p>As seguintes imagens não foram encontradas no servidor: <strong>${skusNaoEncontrados}</strong></p>
            </div>
        `;
    }

    // 2. Renderiza as imagens encontradas na "pasta temporária".
    if (resultados.encontrados.length > 0) {
        resultados.encontrados.forEach(img => {
            tempFolder.innerHTML += `
                <div class="relative group bg-gray-100 rounded-lg overflow-hidden shadow-md text-center">
                    <img src="${img.url}" alt="${img.nome}" class="w-full h-32 object-cover cursor-pointer" onclick="openImageZoomModal('${img.url}')">
                    <div class="p-2">
                        <p class="font-semibold text-sm truncate" title="${img.nome}">${img.nome}</p>
                    </div>
                </div>
            `;
        });
    } else {
        // Se nada foi encontrado, exibe uma mensagem.
        tempFolder.innerHTML = `<p class="col-span-full text-center text-gray-500">Nenhuma das imagens pesquisadas foi encontrada.</p>`;
    }
}


// =================================================================================
// MÓDULO DE PRODUÇÃO (LÓGICA ATUALIZADA PARA ABAS)
// =================================================================================

/**
 * Função principal que carrega e organiza a tela de Produção, separando os itens por abas.
 */
function loadProducao() {
    if (!hasPermission('producao', 'visualizar')) return;

    // Contadores
    const contadorTotal = document.getElementById('contador-producao-total');
    const contadorML = document.getElementById('contador-producao-ml');
    const contadorShopee = document.getElementById('contador-producao-shopee');
    const contadorVC = document.getElementById('contador-producao-vc');

    // Containers para o conteúdo de cada aba
    const containerML = document.getElementById('producao-ml-content');
    const containerShopee = document.getElementById('producao-shopee-content');
    const containerVC = document.getElementById('producao-vc-content');

    if (!containerML || !containerShopee || !containerVC) return;

    // Limpa os containers antes de renderizar
    containerML.innerHTML = '';
    containerShopee.innerHTML = '';
    containerVC.innerHTML = '';

    // Atualiza o contador total de itens em produção.
    contadorTotal.innerText = producao.length;

    // 1. Separa todos os itens de produção por sua origem
    const producaoML = producao.filter(p => p.marketplace === 'Mercado Livre');
    const producaoShopee = producao.filter(p => p.marketplace === 'Shopee');
    const producaoVC = producao.filter(p => p.marketplace !== 'Mercado Livre' && p.marketplace !== 'Shopee');

    // 2. Atualiza os contadores de cada aba
    contadorML.innerText = producaoML.length;
    contadorShopee.innerText = producaoShopee.length;
    contadorVC.innerText = producaoVC.length;

    // 3. Renderiza os grupos de SKU dentro de cada aba correspondente
    renderizarGruposPorAba(producaoML, containerML);
    renderizarGruposPorAba(producaoShopee, containerShopee);
    renderizarGruposPorAba(producaoVC, containerVC);
    
    // Funções que você já tem
    atualizarPainelAcoesProducao();
    applyPermissionsToUI();
}
/**
 * Agrupa e renderiza os itens de uma lista dentro do container de uma aba específica.
 * @param {Array} listaItens - A lista de itens de produção para uma origem (ex: apenas ML).
 * @param {HTMLElement} containerAba - O elemento HTML da aba onde os grupos serão renderizados.
 */
function renderizarGruposPorAba(listaItens, containerAba) {
    if (listaItens.length === 0) {
        containerAba.innerHTML = '<p class="text-center text-gray-500 text-lg py-16">A fila de produção para esta origem está vazia.</p>';
        return;
    }

    // Agrupa os itens da lista por seu grupo de SKU (CL, PC, etc.)
    const producaoAgrupada = listaItens.reduce((acc, item) => {
        const grupo = getGrupoSku(item.sku);
        if (!acc[grupo]) {
            acc[grupo] = [];
        }
        acc[grupo].push(item);
        return acc;
    }, {});

    // Define a ordem de exibição dos grupos
    const ordemGrupos = ['CL', 'FF', 'KC', 'KD', 'PC', 'PH', 'PR', 'PV', 'PV-ESPECIAL', 'RV', 'TP', 'VC', 'PA', 'OUTROS'];
    
    // Renderiza cada grupo na ordem definida
    ordemGrupos.forEach(grupo => {
        if (producaoAgrupada[grupo]) {
            // A função renderGrupoProducao agora renderiza a estrutura de um único grupo
            renderGrupoProducao(grupo, producaoAgrupada[grupo], containerAba);
        }
    });
}

/**
 * Renderiza uma seção completa para um grupo de SKU (ex: "Grupo PC") dentro de uma aba.
 * Esta função permanece quase a mesma, apenas renderiza em um container diferente.
 * @param {string} nomeGrupo - O nome do grupo (ex: "PC").
 * @param {Array} itensGrupo - A lista de itens de produção pertencentes a esse grupo.
 * @param {HTMLElement} containerPai - O elemento HTML da aba onde a seção do grupo será adicionada.
 */
function renderGrupoProducao(nomeGrupo, itensGrupo, containerPai) {
    const hojeString = new Date().toLocaleDateString('pt-BR');

    const itensParaHoje = itensGrupo.filter(item => item.dataColeta === hojeString);
    const itensProximosDias = itensGrupo.filter(item => item.dataColeta !== hojeString);

    itensProximosDias.sort((a, b) => {
        const dataA = new Date(a.dataColeta.split('/').reverse().join('-'));
        const dataB = new Date(b.dataColeta.split('/').reverse().join('-'));
        return dataA - dataB;
    });

    const grupoHtml = `
        <div class="bg-white/90 p-6 rounded-2xl shadow-xl">
            <h3 class="text-2xl font-bold text-gray-800 mb-6 border-b pb-4">Grupo: ${nomeGrupo}</h3>
            
            <!-- Seção para Hoje -->
            <div>
                <h4 class="text-lg font-semibold text-blue-600 mb-4">Para Entregar Hoje (${hojeString})</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                    ${renderCardsProducao(itensParaHoje)}
                </div>
            </div>

            <!-- Seção para Próximos Dias -->
            <div class="mt-8 pt-6 border-t">
                <h4 class="text-lg font-semibold text-gray-700 mb-4">Próximos Dias</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                    ${renderCardsProducao(itensProximosDias)}
                </div>
            </div>
        </div>
    `;
    containerPai.innerHTML += grupoHtml;
}


/**
 * NOVA FUNÇÃO: Controla a visibilidade das abas no módulo de Produção.
 * @param {'ml' | 'shopee' | 'vc'} tabName - O nome da aba a ser exibida.
 */
function showProducaoTab(tabName) {
    // Oculta o conteúdo de todas as abas de produção
    document.querySelectorAll('.producao-tab-content').forEach(content => {
        content.classList.add('hidden');
    });

    // Remove o estilo "ativo" de todos os botões de aba de produção
    document.querySelectorAll('.producao-tab-btn').forEach(btn => {
        btn.classList.remove('border-indigo-600', 'text-indigo-600');
        btn.classList.add('border-transparent', 'text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');
    });

    // Mostra o conteúdo da aba selecionada
    const contentToShow = document.getElementById(`producao-${tabName}-content`);
    if (contentToShow) {
        contentToShow.classList.remove('hidden');
    }

    // Aplica o estilo "ativo" ao botão da aba clicada
    const btnToActivate = document.getElementById(`tab-producao-${tabName}`);
    if (btnToActivate) {
        btnToActivate.classList.add('border-indigo-600', 'text-indigo-600');
        btnToActivate.classList.remove('border-transparent', 'text-gray-500');
    }
}


/**
 * Gera o HTML para uma lista de cards de produção, com destaque para Motoboy.
 * @param {Array} listaItens - A lista de itens para renderizar.
 * @returns {string} O HTML dos cards ou uma mensagem de "nenhum item".
 */
function renderCardsProducao(listaItens) {
    if (listaItens.length === 0) {
        return '<p class="col-span-full text-center text-gray-500 text-sm py-4">Nenhum item nesta seção.</p>';
    }

    const imageMap = images.reduce((acc, img) => {
        acc[img.nome.toUpperCase()] = img.url;
        return acc;
    }, {});

    return listaItens.map(item => {
        const imageUrl = imageMap[item.sku.toUpperCase()] || CAMINHO_IMAGEM_TESTE;
        const checkboxId = `prod-check-${item.op}`;

        // ======================= INÍCIO DA ALTERAÇÃO =======================
        const isMotoboy = item.tipoEntrega === 'Motoboy';
        
        // Aplica a classe 'motoboy-card' se for entrega de motoboy
        const cardClasses = isMotoboy ? 'motoboy-card' : 'bg-white border-gray-200';
        const dataColetaClass = isMotoboy ? 'text-purple-700 font-bold animate-pulse' : 'text-gray-600';
        const tipoEntregaIcon = isMotoboy ? 'fa-motorcycle text-purple-700' : 'fa-box-open text-gray-500';
        // ======================== FIM DA ALTERAÇÃO =========================

        return `
            <div class="producao-card p-4 rounded-xl shadow-md border flex flex-col justify-between transition-all hover:shadow-lg hover:scale-[1.02] ${cardClasses}">
                <div>
                    <img src="${imageUrl}" alt="Arte para ${item.sku}" class="w-full h-40 object-cover rounded-lg mb-3 cursor-pointer" onclick="openImageZoomModal('${imageUrl}')">
                    <p class="font-bold text-xl text-gray-800 truncate" title="${item.sku}">${item.sku}</p>
                    <div class="flex justify-between items-center text-sm mt-2">
                        <span class="font-semibold ${dataColetaClass}">
                            <i class="fas fa-calendar-alt mr-2"></i>${item.dataColeta}
                        </span>
                        <span class="font-semibold flex items-center gap-2">
                            <i class="fas ${tipoEntregaIcon}"></i>${item.tipoEntrega}
                        </span>
                    </div>
                </div>
                <div class="flex items-center justify-end bg-gray-50 p-2 rounded-lg mt-4">
                    <label for="${checkboxId}" class="flex items-center cursor-pointer text-sm font-semibold text-gray-700">
                        <input type="checkbox" id="${checkboxId}" data-op="${item.op}" onchange="atualizarPainelAcoesProducao()" class="producao-checkbox h-5 w-5 text-green-600 border-gray-300 rounded focus:ring-green-500 mr-2">
                        Marcar para Concluir
                    </label>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Atualiza a visibilidade e o contador do painel de ações em massa da produção.
 */
function atualizarPainelAcoesProducao() {
    const painel = document.getElementById('producao-painel-acoes');
    const contador = document.getElementById('producao-contador-selecionados');
    const selecionados = document.querySelectorAll('.producao-checkbox:checked');

    if (selecionados.length > 0) {
        contador.innerText = selecionados.length;
        painel.classList.remove('hidden');
    } else {
        painel.classList.add('hidden');
    }
}

/**
 * Confirma e move todos os itens de produção selecionados para a costura,
 * registrando um log detalhado da operação em massa.
 */
function confirmarConclusaoProducao() {
    // 1. Validação de Permissão
    if (!hasPermission('costura', 'adicionar')) {
        showToast('Permissão negada para enviar para a costura.', 'error');
        return;
    }

    // 2. Coleta dos Itens Selecionados na UI
    const selecionados = document.querySelectorAll('.producao-checkbox:checked');
    if (selecionados.length === 0) {
        showToast('Nenhum item selecionado.', 'info');
        return;
    }

    // 3. Confirmação do Usuário
    if (confirm(`Tem certeza que deseja mover os ${selecionados.length} itens selecionados para a Costura?`)) {
        
        // 4. Preparação para Coleta de Dados do Log
        let itensMovidosContador = 0;
        const skusMovidos = []; // Array para guardar os SKUs para o log
        const opsMovidas = [];  // Array para guardar as OPs para o log

        // 5. Processamento de Cada Item Selecionado
        selecionados.forEach(checkbox => {
            const op = checkbox.dataset.op;
            const itemIndex = producao.findIndex(item => item.op === op);

            if (itemIndex !== -1) {
                // Remove o item da 'producao'
                const [itemMovido] = producao.splice(itemIndex, 1);
                
                // Adiciona o item à 'costura' com todos os seus dados
                costura.push({
                    lote: `LOTE-${Date.now() + itensMovidosContador}`,
                    op: itemMovido.op,
                    sku: itemMovido.sku,
                    status: 'Aguardando Costura',
                    pedidoId: itemMovido.pedidoId,
                    marketplace: itemMovido.marketplace,
                    tipoEntrega: itemMovido.tipoEntrega,
                    dataColeta: itemMovido.dataColeta
                });

                // Incrementa o contador e coleta os dados para o log
                itensMovidosContador++;
                skusMovidos.push(itemMovido.sku);
                opsMovidas.push(itemMovido.op);
            }
        });

        // 6. Finalização e Registro do Log (se algum item foi movido)
        if (itensMovidosContador > 0) {
            saveData();
            loadProducao(); // Atualiza a tela de produção (itens sumiram)
            loadCostura();  // Atualiza a tela de costura (itens apareceram)
            
            // *** NOVO LOG DETALHADO E COMPLETO ***
            logAction({
                acao: `Itens movidos para a Costura`,
                modulo: 'Produção',
                funcao: 'confirmarConclusaoProducao',
                detalhes: { 
                    quantidade: itensMovidosContador, 
                    skus: skusMovidos.join(', '), 
                    ops: opsMovidas.join(', ') 
                }
            });

            showToast(`${itensMovidosContador} item(ns) enviados para a Costura.`, 'success');
        }
    }
}


function renderFilaProducao(itensFila, idImpressora) {
    const container = document.getElementById(`producao-fila-${idImpressora}`);
    if (!container) return;

    if (itensFila.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 text-sm pt-10">Fila vazia.</p>';
        return;
    }

    // Mapa de imagens para acesso rápido.
    const imageMap = images.reduce((acc, img) => {
        acc[img.nome.toUpperCase()] = img.url;
        return acc;
    }, {});
    
    // Mapa de estoque para acesso rápido.
    const estoqueMap = itensEstoque.reduce((acc, item) => {
        const sku = item.sku.toUpperCase();
        acc[sku] = (acc[sku] || 0) + item.qtd;
        return acc;
    }, {});

    container.innerHTML = itensFila.map(item => {
        const imageUrl = imageMap[item.sku.toUpperCase()] || 'https://via.placeholder.com/150?text=Sem+Img';
        const estoqueDisponivel = estoqueMap[item.sku.toUpperCase( )] || 0;
        
        // Encontra o pedido original para pegar a data de coleta.
        const pedidoOriginal = pedidos.find(p => p.id === item.pedidoId && p.sku === item.sku);
        const dataColeta = pedidoOriginal ? pedidoOriginal.dataColeta : 'N/A';
        
        const isMotoboy = item.tipoEntrega === 'Motoboy';
        const motoboyClass = isMotoboy ? 'bg-purple-100 border-purple-500' : 'bg-white border-gray-200';
        const dataColetaClass = isMotoboy ? 'text-purple-700 font-bold animate-pulse' : 'text-gray-600';

        return `
            <div class="producao-card p-4 rounded-xl shadow-md border ${motoboyClass} transition-all hover:shadow-lg hover:scale-[1.02]">
                <!-- Imagem -->
                <img src="${imageUrl}" alt="Arte para ${item.sku}" class="w-full h-32 object-cover rounded-lg mb-3 cursor-pointer" onclick="openImageZoomModal('${imageUrl}')">
                
                <!-- Informações do SKU -->
                <p class="font-bold text-lg text-gray-800">${item.sku}</p>
                <div class="flex justify-between items-center text-sm mt-1">
                    <span class="text-gray-500">Estoque: <strong class="text-blue-600">${estoqueDisponivel}</strong></span>
                    <span class="font-semibold ${dataColetaClass}">Envio: ${dataColeta}</span>
                </div>

                <!-- Ações -->
                <div class="grid grid-cols-2 gap-2 mt-4 text-xs">
                    <button onclick="moverProducaoParaCostura('${item.op}')" class="w-full bg-green-500 text-white p-2 rounded-lg font-semibold hover:bg-green-600" data-permission="producao:editar">
                        <i class="fas fa-check-circle mr-1"></i> Concluído
                    </button>
                    <button onclick="cancelarProducao('${item.op}')" class="w-full bg-red-500 text-white p-2 rounded-lg font-semibold hover:bg-red-600" data-permission="producao:excluir">
                        <i class="fas fa-times-circle mr-1"></i> Cancelar
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Move um item da produção para a costura.
 * @param {string} op - A Ordem de Produção do item.
 */
function moverProducaoParaCostura(op) {
    if (!hasPermission('costura', 'adicionar')) {
        showToast('Permissão negada para enviar para a costura.', 'error');
        return;
    }

    const itemIndex = producao.findIndex(item => item.op === op);
    if (itemIndex === -1) {
        showToast('Item de produção não encontrado.', 'error');
        return;
    }

    const [itemMovido] = producao.splice(itemIndex, 1);
    
    // Adiciona o item à fila da costura
    costura.push({
        lote: `LOTE-${Date.now()}`,
        op: itemMovido.op,
        sku: itemMovido.sku,
        status: 'Aguardando Costura',
        pedidoId: itemMovido.pedidoId
    });

    saveData();
    loadProducao(); // Recarrega a tela de produção para atualizar as filas
    logAction(`Item ${itemMovido.sku} (OP: ${op}) movido da Produção para a Costura.`);
    showToast(`Item ${itemMovido.sku} enviado para a Costura.`, 'success');
}

/**
 * Cancela um item que está na fila de produção.
 * O item volta para a lista de pedidos pendentes.
 * @param {string} op - A Ordem de Produção do item.
 */
function cancelarProducao(op) {
    if (!hasPermission('producao', 'excluir')) {
        showToast('Permissão negada para cancelar produção.', 'error');
        return;
    }

    const itemIndex = producao.findIndex(item => item.op === op);
    if (itemIndex === -1) {
        showToast('Item de produção não encontrado.', 'error');
        return;
    }

    if (confirm('Tem certeza que deseja cancelar a produção deste item? Ele voltará para a fila de pedidos pendentes.')) {
        const [itemCancelado] = producao.splice(itemIndex, 1);

        // Encontra o pedido original e o reverte para 'Pendente'
        const pedidoOriginalIndex = pedidos.findIndex(p => p.id === itemCancelado.pedidoId && p.sku === itemCancelado.sku);
        if (pedidoOriginalIndex !== -1) {
            pedidos[pedidoOriginalIndex].status = 'Pendente';
            delete pedidos[pedidoOriginalIndex].destino;
            delete pedidos[pedidoOriginalIndex].impressora;
            delete pedidos[pedidoOriginalIndex].dataProcessamento;
        }
        
        // Remove o registro do histórico de artes, pois a produção foi cancelada
        historicoArtes = historicoArtes.filter(h => !(h.sku === itemCancelado.sku && h.impressora === itemCancelado.impressora));

        saveData();
        loadProducao(); // Recarrega a tela de produção
        logAction(`Produção do item ${itemCancelado.sku} (OP: ${op}) cancelada.`);
        showToast(`Produção de ${itemCancelado.sku} cancelada.`, 'info');
    }
}

function addProducao() {
    if (!hasPermission('producao', 'adicionar')) {
        showToast('Permissão negada.', 'error');
        return;
    }
    const produto = document.getElementById('producao-produto').value;
    const quantidade = document.getElementById('producao-qtd').value;
    if (!produto || !quantidade) {
        showToast('Preencha o produto e a quantidade.', 'error');
        return;
    }
    const novoItem = {
        op: `OP-${Date.now()}`,
        produto,
        quantidade: parseInt(quantidade),
        status: 'Aguardando'
    };
    producao.push(novoItem);
    saveData();
    logAction(`Nova ordem de produção criada: ${novoItem.op} para ${produto}`);
    showToast('Ordem de produção criada!', 'success');
    loadProducao();
    document.getElementById('producao-produto').value = '';
    document.getElementById('producao-qtd').value = '';
}

function deleteProducao(index) {
    if (!hasPermission('producao', 'excluir')) {
        showToast('Permissão negada.', 'error');
        return;
    }
    const op = producao[index].op;
    if (confirm(`Tem certeza que deseja excluir a ordem de produção ${op}?`)) {
        producao.splice(index, 1);
        saveData();
        logAction(`Ordem de produção ${op} excluída.`);
        showToast('Ordem de produção excluída.', 'success');
        loadProducao();
    }
}

// =================================================================================
// MÓDULO COSTURA
// =================================================================================


function addCostura() {
    if (!hasPermission('costura', 'adicionar')) {
        showToast('Permissão negada.', 'error');
        return;
    }
    const peca = document.getElementById('costura-peca').value;
    const costureira = document.getElementById('costura-costureira').value;
    if (!peca || !costureira) {
        showToast('Preencha a peça e a costureira.', 'error');
        return;
    }
    const novoItem = {
        lote: `LOTE-${Date.now()}`,
        peca,
        costureira,
        status: 'Em andamento'
    };
    costura.push(novoItem);
    saveData();
    logAction(`Novo lote de costura adicionado: ${novoItem.lote}`);
    showToast('Lote de costura adicionado!', 'success');
    loadCostura();
    document.getElementById('costura-peca').value = '';
    document.getElementById('costura-costureira').value = '';
}

function deleteCostura(index) {
    if (!hasPermission('costura', 'excluir')) {
        showToast('Permissão negada.', 'error');
        return;
    }
    const lote = costura[index].lote;
    if (confirm(`Tem certeza que deseja excluir o lote de costura ${lote}?`)) {
        costura.splice(index, 1);
        saveData();
        logAction(`Lote de costura ${lote} excluído.`);
        showToast('Lote de costura excluído.', 'success');
        loadCostura();
    }
}



// =================================================================================
// LOGS DO SISTEMA
// =================================================================================
function updateLogs() {
    const logsDiv = document.getElementById('logs');
    const systemLogsDiv = document.getElementById('logs-system');
    
    const logHtml = logs.slice(0, 10).map(log => `
        <div class="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100">
            <p class="text-sm text-gray-700 flex-1">${log}</p>
        </div>
    `).join('');

    if (logsDiv) logsDiv.innerHTML = logHtml;
    
    if (systemLogsDiv) {
        systemLogsDiv.innerHTML = logs.map((log, index) => `
            <div class="flex items-start space-x-2 mb-2">
                <span class="text-green-400 font-mono text-xs">[${String(index + 1).padStart(3, '0')}]</span>
                <span class="text-green-400 font-mono text-sm">${log}</span>
            </div>
        `).join('');
        systemLogsDiv.scrollTop = 0;
    }
}

// =================================================================================
// INICIALIZAÇÃO
// =================================================================================

document.addEventListener('DOMContentLoaded', () => {
    // 1. Carrega todos os dados do sistema (código original, sem alteração)
    loadData();

    // 2. Configura o botão de importação da Shopee (código original, sem alteração)
    const btnImportShopee = document.getElementById('import-shopee-btn');
    if (btnImportShopee) {
        btnImportShopee.addEventListener('click', triggerShopeeUpload);
    }
    
    // 3. Configura os botões da sidebar e de login (código original, sem alteração)
    document.getElementById('toggle-sidebar').addEventListener('click', toggleSidebar);
    document.getElementById('login-button').addEventListener('click', login);
    document.getElementById('password').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') login();
    });

    // 4. Verifica se há um usuário logado para iniciar a aplicação (código original, sem alteração)
    if (currentUser) {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        document.getElementById('current-user').innerText = currentUser.username;
        initializeApp();
    } else {
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('main-app').classList.add('hidden');
    }
    
});



// =================================================================================
// FUNÇÕES PARA LIMPEZA DE ESTOQUE
// =================================================================================

// Variável global para guardar o modo de limpeza
let clearStockMode = { type: 'total', prefix: '' };

/**
 * Abre o modal de confirmação para limpeza de estoque.
 * @param {'total' | 'prefixo'} type - O tipo de limpeza a ser realizada.
 */
function openClearStockModal(type = 'total') {
    if (!hasPermission('estoque', 'excluir')) {
        showToast('Permissão negada para limpar o estoque.', 'error');
        return;
    }

    const modal = document.getElementById('clear-stock-modal');
    const modalContent = document.getElementById('clear-stock-modal-content');
    const messageEl = document.getElementById('clear-stock-message');
    const keywordEl = document.getElementById('clear-stock-keyword');
    const confirmInput = document.getElementById('clear-stock-confirmation');
    const confirmBtn = document.getElementById('confirm-clear-stock-btn');

    confirmInput.value = ''; // Limpa o campo
    confirmBtn.disabled = true; // Desabilita o botão por padrão

    if (type === 'PREFIXO') {
        const prefix = prompt("Digite o prefixo dos SKUs que deseja limpar (ex: CL, FF, KC, KD, PC, PH, PH, PR, PV, RV, TP, VC):");
        if (!prefix) return; // Usuário cancelou

        clearStockMode = { type: 'prefixo', prefix: prefix.toUpperCase() };
        messageEl.innerHTML = `Você está prestes a <strong>excluir PERMANENTEMENTE</strong> todos os itens de estoque cujo SKU começa com <strong>"${clearStockMode.prefix}"</strong>. Esta ação não pode ser desfeita.`;
        keywordEl.innerText = clearStockMode.prefix;
    } else { // Limpeza total
        clearStockMode = { type: 'total', prefix: '' };
        messageEl.innerHTML = `Você está prestes a <strong>excluir PERMANENTEMENTE</strong> todo o seu estoque. Esta ação não pode ser desfeita.`;
        keywordEl.innerText = 'LIMPAR';
    }

    // Adiciona um "escutador" para habilitar o botão quando a palavra-chave correta for digitada
    confirmInput.oninput = () => {
        confirmBtn.disabled = confirmInput.value !== keywordEl.innerText;
    };

    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    setTimeout(() => {
        modalContent.classList.remove('scale-95', 'opacity-0');
        modalContent.classList.add('scale-100', 'opacity-100');
    }, 10);
}

/**
 * Fecha o modal de limpeza de estoque.
 */
function closeClearStockModal() {
    const modal = document.getElementById('clear-stock-modal');
    const modalContent = document.getElementById('clear-stock-modal-content');
    modalContent.classList.add('scale-95', 'opacity-0');
    modalContent.classList.remove('scale-100', 'opacity-100');
    setTimeout(() => {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }, 200);
}

/**
 * Executa a limpeza do estoque após a confirmação no modal.
 */
function confirmClearStock() {
    let originalCount = itensEstoque.length;
    let itemsRemovedCount = 0;
    let logMessage = '';

    if (clearStockMode.type === 'prefixo') {
        // Filtra o estoque, mantendo apenas os itens que NÃO começam com o prefixo
        itensEstoque = itensEstoque.filter(item => !item.sku.toUpperCase().startsWith(clearStockMode.prefix));
        itemsRemovedCount = originalCount - itensEstoque.length;
        logMessage = `${itemsRemovedCount} item(ns) com prefixo "${clearStockMode.prefix}" foram removidos do estoque.`;
    } else { // Limpeza total
        itemsRemovedCount = itensEstoque.length;
        itensEstoque = []; // Esvazia o array
        logMessage = `Estoque total foi limpo. ${itemsRemovedCount} item(ns) removidos.`;
    }

    saveData();
    applyFilters(); // Atualiza a visualização da tabela de estoque
    loadAdminDashboard(); // Atualiza as métricas do dashboard

    logAction(logMessage);
    showToast(logMessage, 'success');
    closeClearStockModal();
}


// script.js

// =================================================================================
// FUNÇÕES DO SUBMÓDULO DE RELATÓRIO DE TRANSAÇÕES (MODAL)
// =================================================================================



/**
 * Abre o modal do relatório de transações.
 */
function openTransactionsModal() {
    const modal = document.getElementById('transactions-modal');
    const modalContent = document.getElementById('transactions-modal-content');
    
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    
    transacoesPaginaAtual = 1; // Sempre reseta para a página 1 ao abrir o modal
    loadTransactionsModal();   // Carrega os dados e renderiza a primeira página

    setTimeout(() => {
        modalContent.classList.remove('scale-95', 'opacity-0');
        modalContent.classList.add('scale-100', 'opacity-100');
    }, 10);
}



/**
 * Fecha o modal do relatório de transações.
 */
function closeTransactionsModal() {
    const modal = document.getElementById('transactions-modal');
    const modalContent = document.getElementById('transactions-modal-content');
    
    modalContent.classList.add('scale-95', 'opacity-0');
    modalContent.classList.remove('scale-100', 'opacity-100');
    
    setTimeout(() => {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }, 200);
}
// script.js

/**
 * Carrega e filtra os dados dentro do modal de transações.
 * Esta função agora acessa a variável global 'transacoesEstoque' diretamente.
 */
// ======================= INÍCIO DA CORREÇÃO =======================
function loadTransactionsModal() {
    if (!hasPermission('estoque', 'visualizar')) return;
    
    const transacoes = transacoesEstoque;

    if (!Array.isArray(transacoes)) {
        console.error("Erro crítico: 'transacoesEstoque' não é um array ou não está definido.");
        const tableBody = document.getElementById('modal-transacoes-table')?.querySelector('tbody');
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center p-8 text-red-500">Erro ao carregar os dados das transações.</td></tr>`;
        }
        return;
    }

    // Pega os valores dos filtros do modal
    const filterSku = document.getElementById('trans-modal-filter-sku').value.toLowerCase();
    const filterDataInicio = document.getElementById('trans-modal-filter-data-inicio').value;
    const filterDataFim = document.getElementById('trans-modal-filter-data-fim').value;
    const filterTipo = document.getElementById('trans-modal-filter-tipo').value;

    // Filtra o array completo e armazena em uma variável global
    transacoesFiltradasGlobal = transacoes.filter(t => {
        const dataTransacao = new Date(t.timestamp);
        const dataInicio = filterDataInicio ? new Date(filterDataInicio) : null;
        const dataFim = filterDataFim ? new Date(filterDataFim) : null;

        if (dataInicio) dataInicio.setHours(0, 0, 0, 0);
        if (dataFim) dataFim.setHours(23, 59, 59, 999);

        const skuMatch = !filterSku || t.sku.toLowerCase().includes(filterSku);
        const tipoMatch = !filterTipo || t.tipo === filterTipo;
        const dataMatch = (!dataInicio || dataTransacao >= dataInicio) && (!dataFim || dataTransacao <= dataFim);

        return skuMatch && tipoMatch && dataMatch;
    });

    // Reseta para a página 1 sempre que um novo filtro é aplicado
    transacoesPaginaAtual = 1;

    // Renderiza a primeira página dos resultados filtrados
    renderTransactionsPage();
    
    // Atualiza os cards de insights com base em TODOS os resultados filtrados
    updateTransactionInsightsModal(transacoesFiltradasGlobal);
}

/**
 * Atualiza os cards de insights (Top 5) e os gráficos dentro do modal.
 * Esta versão é aprimorada para incluir contagem de transações e gráficos de pizza.
 * @param {Array} transacoes - A lista de transações já filtrada.
 */
function updateTransactionInsightsModal(transacoes) {
    const topEntradasEl = document.getElementById('modal-top-entradas');
    const topSaidasEl = document.getElementById('modal-top-saidas');
    const entradasChartCtx = document.getElementById('entradas-chart')?.getContext('2d');
    const saidasChartCtx = document.getElementById('saidas-chart')?.getContext('2d');

    if (!topEntradasEl || !topSaidasEl || !entradasChartCtx || !saidasChartCtx) {
        console.error("Elementos dos insights não encontrados no DOM.");
        return;
    }

    const entradas = {};
    const saidas = {};

    // Passo 1: Agrega os dados, contando unidades e número de transações
    transacoes.forEach(t => {
        if (t.quantidade > 0) {
            if (!entradas[t.sku]) entradas[t.sku] = { qtd: 0, count: 0 };
            entradas[t.sku].qtd += t.quantidade;
            entradas[t.sku].count++;
        } else {
            if (!saidas[t.sku]) saidas[t.sku] = { qtd: 0, count: 0 };
            saidas[t.sku].qtd += Math.abs(t.quantidade);
            saidas[t.sku].count++;
        }
    });

    // Passo 2: Ordena os dados pela quantidade de unidades e pega os Top 5
    const sortedEntradas = Object.entries(entradas).sort((a, b) => b[1].qtd - a[1].qtd).slice(0, 5);
    const sortedSaidas = Object.entries(saidas).sort((a, b) => b[1].qtd - a[1].qtd).slice(0, 5);

    // Passo 3: Atualiza as listas de texto com informações detalhadas
    topEntradasEl.innerHTML = sortedEntradas.map(([sku, data]) => `
        <li class="text-xs p-1 rounded-md hover:bg-green-50">
            <div class="flex justify-between font-semibold">
                <span class="text-green-800">${sku}</span>
                <span class="font-bold text-green-600">${data.qtd} un.</span>
            </div>
            <div class="text-right text-gray-500">${data.count} transaç${data.count > 1 ? 'ões' : 'ão'}</div>
        </li>
    `).join('') || '<p class="text-sm text-gray-400">Nenhuma entrada no período.</p>';

    topSaidasEl.innerHTML = sortedSaidas.map(([sku, data]) => `
        <li class="text-xs p-1 rounded-md hover:bg-red-50">
            <div class="flex justify-between font-semibold">
                <span class="text-red-800">${sku}</span>
                <span class="font-bold text-red-600">${data.qtd} un.</span>
            </div>
            <div class="text-right text-gray-500">${data.count} transaç${data.count > 1 ? 'ões' : 'ão'}</div>
        </li>
    `).join('') || '<p class="text-sm text-gray-400">Nenhuma saída no período.</p>';

    // Passo 4: Prepara e renderiza os gráficos de pizza
    // Destrói gráficos antigos para evitar sobreposição
    if (charts['entradas-chart']) charts['entradas-chart'].destroy();
    if (charts['saidas-chart']) charts['saidas-chart'].destroy();

    // Gráfico de Entradas
    if (sortedEntradas.length > 0) {
        charts['entradas-chart'] = new Chart(entradasChartCtx, {
            type: 'doughnut',
            data: {
                labels: sortedEntradas.map(([sku]) => sku),
                datasets: [{
                    data: sortedEntradas.map(([, data]) => data.qtd),
                    backgroundColor: ['#10B981', '#34D399', '#6EE7B7', '#A7F3D0', '#D1FAE5'],
                    borderColor: '#FFFFFF',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
    }

    // Gráfico de Saídas
    if (sortedSaidas.length > 0) {
        charts['saidas-chart'] = new Chart(saidasChartCtx, {
            type: 'doughnut',
            data: {
                labels: sortedSaidas.map(([sku]) => sku),
                datasets: [{
                    data: sortedSaidas.map(([, data]) => data.qtd),
                    backgroundColor: ['#EF4444', '#F87171', '#FCA5A5', '#FECACA', '#FEE2E2'],
                    borderColor: '#FFFFFF',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
    }
}

// script.js

/**
 * Mostra ou esconde um campo de motivo com base na seleção.
 * @param {string} selectedValue - O valor do <select>.
 * @param {string} containerId - O ID do contêiner do campo de motivo.
 */
function toggleMotivoField(selectedValue, containerId) {
    const container = document.getElementById(containerId);
    if (selectedValue === 'OUTROS') {
        container.classList.remove('hidden');
    } else {
        container.classList.add('hidden');
    }
}
/**
 * Renderiza apenas a página atual das transações na tabela.
 */
function renderTransactionsPage() {
    const tableBody = document.getElementById('modal-transacoes-table')?.querySelector('tbody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    const totalTransacoes = transacoesFiltradasGlobal.length;
    const totalPaginas = Math.ceil(totalTransacoes / TRANSACOES_POR_PAGINA) || 1;

    // Garante que a página atual seja válida
    if (transacoesPaginaAtual > totalPaginas) transacoesPaginaAtual = totalPaginas;
    if (transacoesPaginaAtual < 1) transacoesPaginaAtual = 1;

    // Calcula o início e o fim da "fatia" de dados para a página atual
    const inicio = (transacoesPaginaAtual - 1) * TRANSACOES_POR_PAGINA;
    const fim = inicio + TRANSACOES_POR_PAGINA;
    const transacoesDaPagina = transacoesFiltradasGlobal.slice(inicio, fim);

    if (transacoesDaPagina.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="text-center p-8 text-gray-500">Nenhuma transação encontrada.</td></tr>`;
    } else {
        let rowsHtml = '';
        transacoesDaPagina.forEach(t => {
            const isEntrada = t.quantidade > 0;
            const qtdClass = isEntrada ? 'text-green-600' : 'text-red-600';
            const qtdSign = isEntrada ? '+' : '';

            rowsHtml += `
                <tr class="border-b hover:bg-gray-100">
                    <td class="p-2 text-xs text-gray-600">${new Date(t.timestamp).toLocaleString('pt-BR')}</td>
                    <td class="p-2 text-xs font-medium text-gray-800">${t.usuario}</td>
                    <td class="p-2 text-xs font-semibold text-indigo-700">${t.sku}</td>
                    <td class="p-2 text-xs">${t.tipo}</td>
                    <td class="p-2 text-xs font-bold ${qtdClass}">${t.quantidade !== 0 ? qtdSign + t.quantidade : '-'}</td>
                    <td class="p-2 text-xs">${t.prateleira}</td>
                    <td class="p-2 text-xs text-gray-500" title="${t.motivo || ''}">${t.motivo ? (t.motivo.length > 50 ? t.motivo.substring(0, 50) + '...' : t.motivo) : '-'}</td>
                </tr>
            `;
        });
        tableBody.innerHTML = rowsHtml;
    }

    renderPaginationControls(totalPaginas, totalTransacoes);
}




/**
 * Desenha os botões "Anterior", "Próxima" e as informações de contagem de página.
 * @param {number} totalPaginas - O número total de páginas calculado.
 * @param {number} totalTransacoes - O número total de transações após a filtragem.
 */
function renderPaginationControls(totalPaginas, totalTransacoes) {
    const controlsContainer = document.getElementById('trans-pagination-controls');
    const infoContainer = document.getElementById('trans-pagination-info');
    if (!controlsContainer || !infoContainer) return;

    if (totalTransacoes > 0) {
        infoContainer.innerText = `Página ${transacoesPaginaAtual} de ${totalPaginas} (${totalTransacoes} transações)`;
        controlsContainer.innerHTML = `
            <button onclick="changeTransactionPage(-1)" class="bg-gray-200 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed" ${transacoesPaginaAtual === 1 ? 'disabled' : ''}>
                <i class="fas fa-arrow-left mr-2"></i>Anterior
            </button>
            <span class="font-semibold text-gray-700">${transacoesPaginaAtual} / ${totalPaginas}</span>
            <button onclick="changeTransactionPage(1)" class="bg-gray-200 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed" ${transacoesPaginaAtual >= totalPaginas ? 'disabled' : ''}>
                Próxima<i class="fas fa-arrow-right ml-2"></i>
            </button>
        `;
    } else {
        infoContainer.innerText = '';
        controlsContainer.innerHTML = '';
    }
}


function changeTransactionPage(change) {
    transacoesPaginaAtual += change;
    renderTransactionsPage();
}
























// =================================================================================
// MÓDULO DE PEDIDOS - CÓDIGO CORRIGIDO E COMPLETO
// =================================================================================

/**
 * Processa os pedidos colados na textarea do marketplace especificado.
 * VERSÃO CORRIGIDA: Agora associa o marketplace aos erros para filtragem correta.
 * @param {'ml' | 'shopee'} marketplace - O marketplace a ser processado.
 */
function processarPedidosMarketplace(marketplace) {
    if (!hasPermission('pedidos', 'importar')) {
        showToast('Você não tem permissão para importar pedidos.', 'error');
        return;
    }

    const inputId = `${marketplace}-input`;
    const inputText = document.getElementById(inputId).value;

    if (!inputText.trim()) {
        showToast('A área de texto está vazia.', 'info');
        return;
    }

    let resultado;
    // Mapeia o nome da aba para o valor que será salvo no objeto do pedido.
    const marketplaceNome = marketplace === 'ml' ? 'Mercado Livre' : 'Shopee';

    // Chama o parser correto com base no botão clicado.
    if (marketplace === 'shopee') {
        resultado = parseShopeeTexto(inputText);
        logAction(`Processando pedidos da Shopee a partir da textarea.`);
    } else {
        resultado = parsePedidosTexto(inputText); // Parser do Mercado Livre
        logAction(`Processando pedidos do Mercado Livre a partir da textarea.`);
    }

    if (resultado.pedidosValidos.length === 0 && resultado.pedidosCancelados.length === 0 && resultado.pedidosComErro.length === 0) {
        showToast('Nenhum pedido válido, cancelado ou com erro encontrado no texto.', 'info');
        return;
    }

    let novosPedidosAdicionados = 0;
    let pedidosDuplicados = 0;
    let atualizadosParaCancelado = 0;

    // Processa pedidos válidos
    resultado.pedidosValidos.forEach(pedidoData => {
        // Garante que o marketplace correto seja atribuído
        pedidoData.marketplace = marketplaceNome;
        const pedidoExistente = pedidos.find(p => p.id === pedidoData.id && p.sku === pedidoData.sku);
        if (!pedidoExistente) {
            pedidos.push(pedidoData);
            novosPedidosAdicionados++;
            // Se um pedido válido é adicionado, remove qualquer erro antigo com o mesmo ID.
            pedidosComErro = pedidosComErro.filter(e => e.id !== pedidoData.id);
        } else {
            pedidosDuplicados++;
        }
    });

    // Processa cancelamentos
    resultado.pedidosCancelados.forEach(pedidoCancelado => {
        pedidoCancelado.marketplace = marketplaceNome;
        const indexExistente = pedidos.findIndex(p => p.id === pedidoCancelado.id && p.sku === pedidoCancelado.sku);
        if (indexExistente !== -1) {
            const pedidoExistente = pedidos[indexExistente];
            if (pedidoExistente.status !== 'Cancelado') {
                pedidoExistente.status = 'Cancelado';
                pedidoExistente.destino = 'Cancelado';
                removerItemDosFluxos(pedidoExistente.id, pedidoExistente.sku);
                atualizadosParaCancelado++;
            }
        } else {
            pedidos.push(pedidoCancelado);
        }
    });
    
    // ======================= INÍCIO DA CORREÇÃO PRINCIPAL =======================
    // Processa os erros, adicionando a informação do marketplace a cada um.
    resultado.pedidosComErro.forEach(erro => {
        // Adiciona a propriedade 'marketplace' ao objeto de erro.
        erro.marketplace = marketplaceNome; 
        
        // Adiciona o erro à lista global apenas se ele ainda não existir.
        if (!pedidosComErro.some(e => e.id === erro.id && e.motivo === erro.motivo)) {
            pedidosComErro.push(erro);
        }
    });
    // ======================== FIM DA CORREÇÃO PRINCIPAL =========================

    // Feedback para o usuário
    if (novosPedidosAdicionados > 0) showToast(`${novosPedidosAdicionados} item(ns) de pedido importado(s) com sucesso!`, 'success');
    if (pedidosDuplicados > 0) showToast(`${pedidosDuplicados} item(ns) já existiam e foram ignorados.`, 'info');
    if (atualizadosParaCancelado > 0) showToast(`ATENÇÃO: ${atualizadosParaCancelado} pedido(s) foram CANCELADOS e removidos da produção!`, 'error');

    saveData();
    loadPedidos(); // Atualiza a UI
    document.getElementById(inputId).value = ''; // Limpa a textarea correta
}




function parsePedidosTexto(text) {
    const pedidosValidos = [];
    const pedidosCancelados = []; // NOVO: Lista para separar os cancelados.
    const erros = [];
    const blocosPedidos = text.split('row-checkbox').filter(b => b.trim() !== '');

    const getFormattedDate = (date) => date.toLocaleDateString('pt-BR');
    const hoje = new Date();
    const amanha = new Date();
    amanha.setDate(hoje.getDate() + 1);

    const meses = {
        'jan': 0, 'fev': 1, 'mar': 2, 'abr': 3, 'mai': 4, 'jun': 5,
        'jul': 6, 'ago': 7, 'set': 8, 'out': 9, 'nov': 10, 'dez': 11
    };

    blocosPedidos.forEach(bloco => {
        const idMatch = bloco.match(/#\d+/);
        const id = idMatch ? idMatch[0] : null;

        if (!id) {
            if (bloco.length > 50) {
                erros.push({ id: 'Desconhecido', motivo: 'Bloco de pedido sem ID de venda.' });
            }
            return;
        }

        const blocoLower = bloco.toLowerCase();
        const isCanceled = blocoLower.includes('venda cancelada') || blocoLower.includes('certifique-se de não enviar este pacote');
        
        const isPackageWithoutSku = blocoLower.includes('pacote de') && !blocoLower.includes('sku:');
        if (isPackageWithoutSku) {
            erros.push({ id: id, motivo: 'Pedido em pacote sem SKUs individuais listados.' });
            return;
        }

        let tipoEntrega = 'Coleta';
        if (blocoLower.includes('dar o pacote ao seu motorista')) {
            tipoEntrega = 'Motoboy';
        }
        
        const marketplace = blocoLower.includes('shopee') ? 'Shopee' : 'Mercado Livre';

        let dataColeta;
        const dataMatch = blocoLower.match(/(?:em|até)\s+(\d{1,2})\s+de\s+([a-z]{3})/);
        if (dataMatch) {
            const dia = parseInt(dataMatch[1]);
            const mesStr = dataMatch[2];
            const mes = meses[mesStr];
            if (mes !== undefined) {
                const ano = hoje.getFullYear();
                dataColeta = getFormattedDate(new Date(ano, mes, dia));
            }
        }

        if (!dataColeta) {
            const frasesAmanha = ['coleta que passará amanhã', 'entregar o pacote amanhã', 'dar o pacote ao seu motorista amanhã', 'dia seguinte'];
            if (frasesAmanha.some(frase => blocoLower.includes(frase))) {
                dataColeta = getFormattedDate(amanha);
            }
        }

        if (!dataColeta) {
            const frasesHoje = ['coleta que passará hoje', 'entregar o pacote hoje'];
            if (frasesHoje.some(frase => blocoLower.includes(frase))) {
                dataColeta = getFormattedDate(hoje);
            }
        }
        
        if (!dataColeta) {
            dataColeta = getFormattedDate(hoje);
        }

        const blocosProdutos = bloco.split('product').filter(p => p.trim() !== '' && p.includes('SKU:'));

        if (blocosProdutos.length === 0) {
            if (!isCanceled) {
                erros.push({ id: id, motivo: 'Não foi possível encontrar produtos com SKU neste pedido.' });
            }
            return;
        }

        blocosProdutos.forEach(blocoProduto => {
            const skuMatch = blocoProduto.match(/SKU:\s*([A-Z0-9-]+)/i);
            const unidadeMatch = blocoProduto.match(/(\d+)\s+unidade/i);

            if (skuMatch && unidadeMatch) {
                const skuOriginal = skuMatch[1].trim();
                let skuLimpo = skuOriginal;

                // ======================= INÍCIO DA CORREÇÃO =======================
                // Verifica se o SKU NÃO é um PV-Especial antes de limpar o sufixo.
                // A expressão /PV.*(-100|-999|-VF)$/i verifica se o SKU começa com "PV" e termina com um dos sufixos especiais.
                // O "!" na frente inverte a lógica, ou seja, o código só entra no 'if' se NÃO for um PV-Especial.
                if (!/PV.*(-100|-999|-VF)$/i.test(skuOriginal)) {
                    skuLimpo = skuOriginal.replace(/-(F|P|V|C)$/i, '');
                }
                // Se for um PV-Especial, a variável 'skuLimpo' manterá o valor de 'skuOriginal', preservando o sufixo.
                // ======================== FIM DA CORREÇÃO =========================

                const pedidoData = {
                    id: id,
                    marketplace,
                    dataColeta,
                    tipoEntrega,
                    sku: skuLimpo,
                    quantidade: parseInt(unidadeMatch[1]),
                    status: 'Pendente',
                    dataImportacao: new Date().toISOString()
                };

                if (isCanceled) {
                    pedidoData.status = 'Cancelado';
                    pedidosCancelados.push(pedidoData);
                } else {
                    pedidosValidos.push(pedidoData);
                }

            } else {
                if (!isCanceled) {
                    erros.push({ id: id, motivo: `Produto sem SKU ou quantidade definidos.` });
                }
            }
        });
    });

    return { pedidosValidos, pedidosCancelados, pedidosComErro: erros };
}




/**
 * Define a lógica de agrupamento por SKU, com regras estritas e na ordem correta para ser automática.
 * @param {string} sku - O SKU do produto.
 * @returns {string} O nome do grupo ao qual o SKU pertence.
 */
function getGrupoSku(sku) {
    if (!sku) return "OUTROS";

    const code = sku.toUpperCase().trim();

    // --- PV ESPECIAL: termina em -100, -999, -VF ou contém marcadores específicos ---
    if (/^PV.*(?:-100|-999|-VF)(?:\b|$)/i.test(code)) {
        return "PV-ESPECIAL";
    }

    // --- PV Normal: começa com PV mas não é especial ---
    if (/^PV/i.test(code)) {
        return "PV";
    }

    // --- Outros prefixos conhecidos ---
    const prefixos = ["CL", "FF", "KC", "KD", "PC", "PH", "PR", "RV", "TP", "VC"];
    for (let prefix of prefixos) {
        if (code.startsWith(prefix)) {
            return prefix;
        }
    }

    return "OUTROS";
}




/**
 * Remove um item específico de todas as filas de fluxo de trabalho (produção, costura, etc.).
 * Esta função é chamada quando um pedido é cancelado após já ter sido processado.
 * @param {string} pedidoId - O ID do pedido a ser removido (ex: '#2000012927197986').
 * @param {string} sku - O SKU do item a ser removido.
 */
function removerItemDosFluxos(pedidoId, sku) {
    let itemRemovido = false;

    // 1. Procura e remove da fila de PRODUÇÃO
    const producaoIndex = producao.findIndex(p => p.pedidoId === pedidoId && p.sku === sku);
    if (producaoIndex !== -1) {
        producao.splice(producaoIndex, 1);
        itemRemovido = true;
    }

    // 2. Procura e remove da fila de COSTURA (caso já tenha avançado)
    const costuraIndex = costura.findIndex(c => c.pedidoId === pedidoId && c.sku === sku);
    if (costuraIndex !== -1) {
        costura.splice(costuraIndex, 1);
        itemRemovido = true;
    }

    // 3. Procura e remove da fila de EXPEDIÇÃO (caso já tenha avançado)
    const expedicaoIndex = expedicao.findIndex(e => e.pedidoId === pedidoId && e.sku === sku);
    if (expedicaoIndex !== -1) {
        expedicao.splice(expedicaoIndex, 1);
        itemRemovido = true;
    }

    if (itemRemovido) {
        logAction(`Item ${sku} (Pedido: ${pedidoId}) foi removido das filas de trabalho devido a cancelamento.`);
    }
}






// =================================================================================
// MÓDULO DE PEDIDOS - CÓDIGO CORRIGIDO E COMPLETO
// =================================================================================

/**
 * Carrega e renderiza os pedidos, agrupando-os por marketplace e, em seguida, por grupo de SKU.
 * ATUALIZADO: Agora considera o status 'Pendente-Atenção' como um pedido pendente.
 */
function loadPedidos() {
    if (!hasPermission('pedidos', 'visualizar')) return;

    // Containers para cada marketplace/canal.
    const mlContainer = document.getElementById('pedidos-ml-container');
    const shopeeContainer = document.getElementById('pedidos-shopee-container');
    const vcContainer = document.getElementById('pedidos-vc-container');
    
    // Containers para as seções de erros e cancelados
    const errosSection = document.getElementById('pedidos-com-erro-section');
    const errosContainer = document.getElementById('pedidos-com-erro-container');
    const canceladosSection = document.getElementById('pedidos-cancelados-section');
    const canceladosContainer = document.getElementById('pedidos-cancelados-container');

    // Contadores para as abas.
    const contadorML = document.getElementById('contador-ml');
    const contadorShopee = document.getElementById('contador-shopee');
    const contadorVC = document.getElementById('contador-vc');
    const contadorTotal = document.getElementById('contador-pedidos-pendentes');

    // Limpa todos os containers antes de renderizar.
    mlContainer.innerHTML = '';
    shopeeContainer.innerHTML = '';
    if (vcContainer) vcContainer.innerHTML = '';
    if (errosContainer) errosContainer.innerHTML = '';
    if (canceladosContainer) canceladosContainer.innerHTML = '';

    // --- ALTERAÇÃO PRINCIPAL AQUI ---
    // Filtra os pedidos que estão aguardando processamento, incluindo o novo status de atenção.
    const pedidosPendentes = pedidos.filter(p => p.status === 'Pendente' || p.status === 'Pendente-Atenção');
    const pedidosCancelados = pedidos.filter(p => p.status === 'Cancelado');
    // --- FIM DA ALTERAÇÃO ---

    // Atualiza o contador total de pedidos pendentes (usando Set para contar IDs únicos).
    contadorTotal.innerText = new Set(pedidosPendentes.map(p => p.id)).size;

    // Separa os pedidos pendentes por sua origem.
    const pedidosML = pedidosPendentes.filter(p => p.marketplace === 'Mercado Livre');
    const pedidosShopee = pedidosPendentes.filter(p => p.marketplace === 'Shopee');
    const pedidosVC = pedidosPendentes.filter(p => p.marketplace !== 'Mercado Livre' && p.marketplace !== 'Shopee');

    // Atualiza os contadores individuais de cada aba.
    contadorML.innerText = new Set(pedidosML.map(p => p.id)).size;
    contadorShopee.innerText = new Set(pedidosShopee.map(p => p.id)).size;
    if (contadorVC) contadorVC.innerText = new Set(pedidosVC.map(p => p.id)).size;

    // Função auxiliar para renderizar os grupos de cards de pedido.
    const renderizarGrupos = (listaPedidos, container) => {
        if (!container) return;
        if (listaPedidos.length === 0) {
            container.innerHTML = `<p class="text-gray-500 col-span-full text-center py-4">Nenhum pedido pendente aqui.</p>`;
            return;
        }
        const pedidosAgrupados = listaPedidos.reduce((acc, pedido) => {
            const grupo = getGrupoSku(pedido.sku);
            if (!acc[grupo]) acc[grupo] = [];
            acc[grupo].push(pedido);
            return acc;
        }, {});
        const ordemGrupos = ['CL', 'FF', 'KC', 'KD', 'PC', 'PH', 'PR', 'PV', 'PV-ESPECIAL', 'RV', 'TP', 'VC', 'PA', 'OUTROS'];
        container.innerHTML = ''; // Limpa antes de adicionar
        ordemGrupos.forEach(grupo => {
            if (pedidosAgrupados[grupo]) {
                const grupoContainer = document.createElement('div');
                grupoContainer.className = 'col-span-full mb-6';
                grupoContainer.innerHTML = `<h4 class="text-xl font-semibold text-gray-700 border-b pb-2 mb-4">Grupo: ${grupo}</h4>`;
                const gridContainer = document.createElement('div');
                gridContainer.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6';
                pedidosAgrupados[grupo].sort((a, b) => a.sku.localeCompare(b.sku));
                renderizarCardsDePedido(pedidosAgrupados[grupo], gridContainer);
                grupoContainer.appendChild(gridContainer);
                container.appendChild(grupoContainer);
            }
        });
    };

    renderizarGrupos(pedidosML, mlContainer);
    renderizarGrupos(pedidosShopee, shopeeContainer);
    renderizarGrupos(pedidosVC, vcContainer);

    // Renderiza a seção de erros, se houver algum.
    if (pedidosComErro.length > 0) {
        errosSection.classList.remove('hidden');
        errosContainer.innerHTML = pedidosComErro.map((erro, index) => `
            <div class="bg-orange-100 p-4 rounded-lg shadow border-l-4 border-orange-500 flex justify-between items-center">
                <div>
                    <p class="font-bold text-orange-800">ID: ${erro.id}</p>
                    <p class="text-sm text-orange-600">${erro.motivo}</p>
                </div>
                <button onclick="removerErro(${index})" class="text-orange-500 hover:text-orange-700 font-bold">X</button>
            </div>
        `).join('');
    } else {
        errosSection.classList.add('hidden');
    }

    // Renderiza a seção de cancelados, se houver algum.
    if (pedidosCancelados.length > 0) {
        canceladosSection.classList.remove('hidden');
        canceladosContainer.innerHTML = pedidosCancelados.map(pedido => `
            <div class="bg-red-100 p-4 rounded-lg shadow border-l-4 border-red-500">
                <p class="font-bold text-red-800">${pedido.sku}</p>
                <p class="text-sm text-red-600">${pedido.id} - Qtd: ${pedido.quantidade}</p>
                <p class="text-xs font-semibold text-red-700 mt-2">VENDA CANCELADA. NÃO ENVIAR.</p>
            </div>
        `).join('');
    } else {
        canceladosSection.classList.add('hidden');
    }

    atualizarPainelAcoes();
    applyPermissionsToUI();
}







// Variável global para guardar os dados do item que precisa de autorização
let itemPendenteAutorizacao = null;

/**
 * Abre o modal de autorização para a segunda unidade.
 * @param {object} pedido - O objeto do pedido que está no estado 'Pendente-Atenção'.
 */
function abrirModalAutorizacao(pedido) {
    itemPendenteAutorizacao = pedido;

    const modal = document.getElementById('autorizacao-duplicidade-modal');
    const modalContent = document.getElementById('autorizacao-duplicidade-modal-content');
    
    // Preenche as informações no modal
    document.getElementById('auth-sku-label').innerText = pedido.sku;
    document.getElementById('auth-pedido-label').innerText = pedido.id;
    document.getElementById('auth-novo-sku-input').value = '';

    // Exibe o modal
    modal.classList.remove('hidden');
    setTimeout(() => {
        modalContent.classList.remove('scale-95', 'opacity-0');
        modalContent.classList.add('scale-100', 'opacity-100');
        document.getElementById('auth-novo-sku-input').focus();
    }, 10);
}

/**
 * Fecha o modal de autorização.
 */
function fecharModalAutorizacao() {
    const modal = document.getElementById('autorizacao-duplicidade-modal');
    const modalContent = document.getElementById('autorizacao-duplicidade-modal-content');

    modalContent.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        itemPendenteAutorizacao = null; // Limpa a variável de estado
    }, 200);
}

/**
 * Ação do admin: troca o SKU do item pendente e o processa.
 */
function trocarSkuEProcessarAutorizado() {
    const novoSku = document.getElementById('auth-novo-sku-input').value.trim().toUpperCase();
    if (!itemPendenteAutorizacao || !novoSku) {
        showToast('Por favor, insira um novo SKU válido.', 'error');
        return;
    }

    // Encontra o pedido original para alterá-lo
    const pedidoIndex = pedidos.findIndex(p => p.id === itemPendenteAutorizacao.id && p.sku === itemPendenteAutorizacao.sku && p.status === 'Pendente-Atenção');
    if (pedidoIndex !== -1) {
        pedidos[pedidoIndex].sku = novoSku;
        pedidos[pedidoIndex].status = 'Pendente'; // Volta ao status normal para ser processado
        
        saveData();
        logAction(`Admin trocou SKU de ${itemPendenteAutorizacao.sku} para ${novoSku} no pedido ${itemPendenteAutorizacao.id}`);
        showToast(`SKU alterado para ${novoSku}. Reenviando para o fluxo...`, 'success');
        
        fecharModalAutorizacao();
        loadPedidos(); // Atualiza a tela para refletir a mudança antes de reprocessar
        // O usuário precisará selecionar o card novamente, agora com o SKU correto.
    } else {
        showToast('Erro: não foi possível encontrar o pedido pendente para alterar.', 'error');
    }
}






/**
 * Remove um erro da lista de erros persistentes.
 */
function removerErro(index) {
    if (confirm(`Tem certeza que deseja remover este aviso de erro?`)) {
        pedidosComErro.splice(index, 1);
        saveData();
        loadPedidos();
        showToast("Aviso de erro removido.", "success");
    }
}

/**
 * Renderiza os cards de pedido, aplicando status visuais e controle de permissão.
 * VERSÃO FINAL: Passa o objeto do pedido diretamente para a função de clique do admin.
 */
function renderizarCardsDePedido(listaPedidos, container) {
    const estoquePorSku = itensEstoque.reduce((acc, item) => {
        const skuBase = item.sku.replace(/-(F|V|P|C)$/i, '').trim();
        acc[skuBase] = (acc[skuBase] || 0) + item.qtd;
        return acc;
    }, {});
    
    const imageMap = images.reduce((acc, img) => {
        acc[img.nome.toUpperCase()] = img.url;
        return acc;
    }, {});

    const pedidosAgrupados = listaPedidos.reduce((acc, pedido) => {
        const chave = `${pedido.id}-${pedido.sku}`;
        if (!acc[chave]) {
            acc[chave] = { ...pedido, quantidade: 0 };
        }
        acc[chave].quantidade += pedido.quantidade;
        if (pedido.status === 'Pendente-Atenção') {
            acc[chave].status = 'Pendente-Atenção';
        }
        return acc;
    }, {});

    const listaFinalParaRenderizar = Object.values(pedidosAgrupados);

    listaFinalParaRenderizar.forEach(pedido => {
        const skuOriginal = pedido.sku;
        let skuParaExibicao = skuOriginal;
        let skuBaseParaLogica = skuOriginal;

        if (!/PV.*(-100|-999|-VF)$/i.test(skuOriginal)) {
            skuBaseParaLogica = skuOriginal.replace(/-(F|P|V|C)$/i, '').trim();
            skuParaExibicao = skuBaseParaLogica; 
        }

        const quantidadeEmEstoque = estoquePorSku[skuBaseParaLogica] || 0;
        const temEstoque = quantidadeEmEstoque >= pedido.quantidade;
        const isMotoboy = pedido.tipoEntrega === 'Motoboy';
        
        const isAdmin = currentUser.role === 'admin-master' || currentUser.role === 'admin-setor';
        const requerAtencao = pedido.status === 'Pendente-Atenção';
        
        let corBorda = temEstoque ? 'border-green-500' : 'border-red-500';
        let statusHtml;
        let checkboxAction = `onchange="atualizarPainelAcoes()"`;
        let checkboxDisabled = false;
        let checkboxTitle = "Selecionar para mover";

        if (requerAtencao) {
            corBorda = 'border-yellow-400';
            statusHtml = `<div class="text-center px-3 py-1 rounded-full text-sm font-semibold bg-yellow-100 text-yellow-800 flex items-center gap-2 animate-pulse"><i class="fas fa-hourglass-half"></i><span>Aguardando Confirmação</span></div>`;
            
            if (isAdmin) {
                // --- MUDANÇA CRÍTICA AQUI ---
                // Passa o objeto 'pedido' inteiro como uma string JSON.
                checkboxAction = `onclick='handleAdminCheckboxClick(this, ${JSON.stringify(pedido)})'`;
                checkboxTitle = "Clique para autorizar a segunda unidade";
            } else {
                checkboxDisabled = true;
                checkboxTitle = "Ação bloqueada. Requer autorização de um administrador.";
            }
        } else {
            statusHtml = `<div class="text-center px-3 py-1 rounded-full text-sm font-semibold ${temEstoque ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'} flex items-center gap-2"><i class="fas ${temEstoque ? 'fa-check-circle' : 'fa-exclamation-triangle'}"></i><span>${temEstoque ? `Estoque: ${quantidadeEmEstoque}` : `Faltam: ${pedido.quantidade - quantidadeEmEstoque}`}</span></div>`;
        }
        
        if (isMotoboy && !requerAtencao) {
            corBorda = 'border-purple-500';
        }

        const checkboxId = `pedido-${pedido.id.replace('#','')}-${skuOriginal}`;
        const imageUrl = imageMap[skuBaseParaLogica.toUpperCase()] || CAMINHO_IMAGEM_TESTE;

        let idParaExibicao = pedido.id;
        if (idParaExibicao.includes('-')) idParaExibicao = idParaExibicao.split('-')[0];
        if (!idParaExibicao.startsWith('#')) idParaExibicao = '#' + idParaExibicao;

        let tituloCardHtml = `<div class="editable-sku p-1 rounded" ondblclick="iniciarEdicaoSku(this, '${pedido.id}', '${pedido.sku}')" title="Dê um duplo clique para editar o SKU"><p class="font-bold text-lg text-gray-800">${skuParaExibicao}</p><p class="text-xs text-gray-500">${idParaExibicao}</p></div>`;

        const cardHtml = `
            <div class="bg-white rounded-2xl p-5 shadow-lg border-l-4 ${corBorda} ${isMotoboy ? 'motoboy-card' : ''} flex flex-col justify-between">
                <div>
                    <div class="flex justify-between items-start mb-3">
                        <div>${tituloCardHtml}</div>
                        <div class="text-right">
                            <p class="font-semibold ${isMotoboy ? 'text-purple-700' : ''}">${pedido.tipoEntrega}</p>
                            <p class="text-xs text-gray-500">Coleta: ${pedido.dataColeta}</p>
                        </div>
                    </div>
                    <img src="${imageUrl}" class="w-full h-32 object-cover rounded-lg mb-3 cursor-pointer" onclick="openImageZoomModal('${imageUrl}')" alt="${skuParaExibicao}">
                </div>
                <div class="flex justify-between items-center bg-gray-50 p-3 rounded-lg mt-3">
                    <div class="text-center">
                        <p class="text-sm text-gray-600">Pedido</p>
                        <p class="font-bold text-xl text-indigo-600">${pedido.quantidade}</p>
                    </div>
                    ${statusHtml}
                    <div class="text-center">
                        <input type="checkbox" id="${checkboxId}" data-pedido-id="${pedido.id}" data-sku="${skuOriginal}" ${checkboxAction} 
                               class="pedido-checkbox h-6 w-6 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50" 
                               title="${checkboxTitle}" ${checkboxDisabled ? 'disabled' : ''}>
                    </div>
                </div>
            </div>`;
        container.innerHTML += cardHtml;
    });
}


/**
 * Lida com o clique no checkbox de um item que requer autorização de admin.
 * @param {HTMLInputElement} checkbox - O elemento do checkbox que foi clicado.
 * @param {object} pedido - O objeto do pedido que precisa de autorização.
 */
function handleAdminCheckboxClick(checkbox, pedido) {
    checkbox.checked = false; // Impede a marcação visual imediata
    
    if (pedido) {
        abrirModalAutorizacao(pedido);
    } else {
        showToast('Erro: Dados do pedido não foram recebidos corretamente.', 'error');
    }
    
    atualizarPainelAcoes();
}






/**
 * Renderiza todos os pedidos nas seções corretas da UI: Pendentes, Cancelados e com Erro.
 */
function renderizarPedidos() {
    const pendentesContainer = document.getElementById('pedidos-pendentes-container');
    const canceladosContainer = document.getElementById('pedidos-cancelados-container');
    const errosContainer = document.getElementById('pedidos-com-erro-container');
    const canceladosSection = document.getElementById('pedidos-cancelados-section');
    const errosSection = document.getElementById('pedidos-com-erro-section');

    // Limpa os containers antes de redesenhar
    pendentesContainer.innerHTML = '';
    canceladosContainer.innerHTML = '';
    errosContainer.innerHTML = '';

    // Filtra os pedidos em listas separadas por status
    const pedidosPendentes = pedidos.filter(p => p.status === 'Pendente');
    const pedidosCancelados = pedidos.filter(p => p.status === 'Cancelado');

    // Renderiza Pedidos Pendentes (cards azuis)
    if (pedidosPendentes.length > 0) {
        pedidosPendentes.forEach(pedido => {
            pendentesContainer.innerHTML += `
                <div class="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
                    <p class="font-bold text-gray-800">${pedido.sku}</p>
                    <p class="text-sm text-gray-600">${pedido.id} - Qtd: ${pedido.quantidade}</p>
                </div>
            `;
        });
    } else {
        pendentesContainer.innerHTML = '<p class="text-gray-500 col-span-full">Nenhum pedido pendente.</p>';
    }

    // **Renderiza Pedidos Cancelados (seção e cards vermelhos)**
    if (pedidosCancelados.length > 0) {
        canceladosSection.classList.remove('hidden'); // Mostra a seção
        pedidosCancelados.forEach(pedido => {
            canceladosContainer.innerHTML += `
                <div class="bg-red-100 p-4 rounded-lg shadow border-l-4 border-red-500">
                    <p class="font-bold text-red-800">${pedido.sku}</p>
                    <p class="text-sm text-red-600">${pedido.id} - Qtd: ${pedido.quantidade}</p>
                    <p class="text-xs font-semibold text-red-700 mt-2">VENDA CANCELADA. NÃO ENVIAR.</p>
                </div>
            `;
        });
    } else {
        canceladosSection.classList.add('hidden'); // Esconde a seção se não houver cancelados
    }

    // Renderiza Erros de Importação (seção e cards laranjas)
    if (pedidosComErro.length > 0) {
        errosSection.classList.remove('hidden');
        pedidosComErro.forEach((erro, index) => {
            errosContainer.innerHTML += `
                <div class="bg-orange-100 p-4 rounded-lg shadow border-l-4 border-orange-500 flex justify-between items-center">
                    <div>
                        <p class="font-bold text-orange-800">ID: ${erro.id}</p>
                        <p class="text-sm text-orange-600">${erro.motivo}</p>
                    </div>
                    <button onclick="removerErro(${index})" class="text-orange-500 hover:text-orange-700 font-bold">X</button>
                </div>
            `;
        });
    } else {
        errosSection.classList.add('hidden');
    }
}



/**
 * Mostra/esconde o painel de ações em massa e copia os SKUs para a área de transferência.
 * VERSÃO FINAL CORRIGIDA: Garante que para SKUs do grupo "OUTROS", apenas a parte numérica seja copiada.
 */
function atualizarPainelAcoes() {
    const painel = document.getElementById('painel-acoes-massa');
    const contador = document.getElementById('contador-selecionados');
    const selecionados = document.querySelectorAll('.pedido-checkbox:checked');
    
    if (selecionados.length > 0) {
        contador.innerText = selecionados.length;
        painel.classList.remove('hidden');

        // ======================= INÍCIO DA LÓGICA CORRIGIDA =======================
        // Usa um Set para garantir que cada valor copiado seja único.
        const valoresParaCopiar = new Set();
        
        selecionados.forEach(checkbox => {
            const sku = checkbox.dataset.sku;
            
            // Verifica se o SKU pertence ao grupo "OUTROS".
            if (getGrupoSku(sku) === 'OUTROS') {
                // Se for "OUTROS", extrai apenas a primeira sequência de números.
                const matchNumerico = sku.match(/\d+/);
                if (matchNumerico) {
                    valoresParaCopiar.add(matchNumerico[0]); // Adiciona só o número: "34567"
                }
            } else {
                // Para todos os outros grupos, remove as variações (-F, -P, etc.) e adiciona o SKU base.
                const skuBase = sku.replace(/-(C|F|P|V)$/i, "");
                valoresParaCopiar.add(skuBase);
            }
        });

        // Converte o Set de volta para um array e junta com vírgulas.
        const textoParaCopiar = Array.from(valoresParaCopiar).join(',');
        // ======================== FIM DA LÓGICA CORRIGIDA =========================

        // Copia o texto final para a área de transferência.
        navigator.clipboard.writeText(textoParaCopiar).catch(err => {
            console.error('Falha ao copiar SKUs: ', err);
        });

    } else {
        painel.classList.add('hidden');
    }
}




// Adicione estas variáveis globais no topo do seu script.js, junto com as outras
let edicaoSkuEmAndamento = null; // Guarda as informações do item que está sendo editado

/**
 * Função principal chamada pelo duplo clique no SKU.
 * Inicia o processo de edição, guardando os dados do item e abrindo o modal de senha.
 * @param {HTMLElement} elementoSku - O elemento HTML (ex: <p>) que contém o SKU.
 * @param {string} pedidoId - O ID do pedido (ex: '#2000009261599029').
 * @param {string} skuAtual - O SKU atual que será editado.
 */
function iniciarEdicaoSku(elementoSku, pedidoId, skuAtual) {
    // Guarda as informações necessárias para quando a senha for validada
    edicaoSkuEmAndamento = {
        elemento: elementoSku,
        pedidoId: pedidoId,
        skuAntigo: skuAtual
    };

    // Abre o modal de autenticação
    const modal = document.getElementById('admin-auth-modal');
    const modalContent = document.getElementById('admin-auth-modal-content');
    
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    
    setTimeout(() => {
        modalContent.classList.remove('scale-95', 'opacity-0');
        modalContent.classList.add('scale-100', 'opacity-100');
        document.getElementById('admin-password-input').focus(); // Foca no campo de senha
    }, 10);
}

/**
 * Valida a senha do administrador e, se correta, transforma o SKU em um campo editável.
 */
function validarSenhaEProsseguirEdicao() {
    const senhaInput = document.getElementById('admin-password-input');
    const senhaDigitada = senhaInput.value;

    // Encontra um usuário que seja 'admin-master' para validar a senha
    const adminUser = users.find(u => u.role === 'admin-master' && u.password === senhaDigitada);

    if (!adminUser) {
        showToast('Senha de administrador incorreta!', 'error');
        senhaInput.value = ''; // Limpa o campo
        senhaInput.focus();
        return;
    }

    // Se a senha está correta, fecha o modal e habilita a edição
    fecharModalAuth();

    const { elemento, skuAntigo } = edicaoSkuEmAndamento;

    // Transforma o texto do SKU em um campo de input para edição
    elemento.innerHTML = `
        <div class="flex items-center gap-1">
            <input type="text" value="${skuAntigo}" class="w-full p-1 border-2 border-indigo-400 rounded focus:outline-none" id="sku-edit-input">
            <button onclick="salvarEdicaoSku()" class="text-green-600 hover:text-green-800 p-1"><i class="fas fa-check"></i></button>
            <button onclick="cancelarEdicaoSku(true)" class="text-red-600 hover:text-red-800 p-1"><i class="fas fa-times"></i></button>
        </div>
    `;
    
    const inputEdicao = document.getElementById('sku-edit-input');
    inputEdicao.focus();
    inputEdicao.select(); // Seleciona o texto para facilitar a digitação

    // Adiciona um "escutador" para salvar com 'Enter' ou cancelar com 'Escape'
    inputEdicao.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            salvarEdicaoSku();
        } else if (e.key === 'Escape') {
            cancelarEdicaoSku(true);
        }
    });
}

/**
 * Salva o novo SKU no sistema.
 */
function salvarEdicaoSku() {
    const novoSku = document.getElementById('sku-edit-input').value.trim().toUpperCase();
    const { pedidoId, skuAntigo, elemento } = edicaoSkuEmAndamento;

    if (!novoSku || novoSku === skuAntigo) {
        // Se o SKU não mudou ou está vazio, apenas cancela a edição
        cancelarEdicaoSku(true);
        return;
    }

    // Encontra o item de pedido correspondente no array 'pedidos'
    const pedidoItem = pedidos.find(p => p.id === pedidoId && p.sku === skuAntigo);

    if (pedidoItem) {
        // Atualiza o SKU no objeto do pedido
        pedidoItem.sku = novoSku;
        
        // Salva os dados no localStorage
        saveData();
        
        // Registra a ação no log
        logAction(`ADMIN EDIT: SKU do pedido ${pedidoId} alterado de '${skuAntigo}' para '${novoSku}' pelo admin.`);
        showToast('SKU atualizado com sucesso!', 'success');

        // Recarrega a visualização dos pedidos para refletir a mudança
        loadPedidos(); 
    } else {
        showToast('Erro: Não foi possível encontrar o item do pedido para atualizar.', 'error');
        // Restaura a visualização original
        elemento.innerText = skuAntigo;
    }

    // Limpa a variável de estado
    edicaoSkuEmAndamento = null;
}

/**
 * Cancela a operação de edição e restaura a visualização.
 * @param {boolean} restaurarVisualizacao - Se true, restaura o texto original do SKU.
 */
function cancelarEdicaoSku(restaurarVisualizacao = false) {
    if (restaurarVisualizacao && edicaoSkuEmAndamento) {
        const { elemento, skuAntigo } = edicaoSkuEmAndamento;
        elemento.innerText = skuAntigo; // Restaura o texto original
    }
    fecharModalAuth();
    edicaoSkuEmAndamento = null; // Limpa o estado da edição
}

/**
 * Função auxiliar para fechar e resetar o modal de autenticação.
 */
function fecharModalAuth() {
    const modal = document.getElementById('admin-auth-modal');
    const modalContent = document.getElementById('admin-auth-modal-content');
    
    modalContent.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
        document.getElementById('admin-password-input').value = ''; // Limpa a senha
    }, 200);
}





/**
 * Inicia o fluxo de decisão. Pega TODOS os itens selecionados via checkbox
 * e os envia para o modal de decisão.
 * CORREÇÃO: Desmarca os checkboxes após a ação.
 */
function confirmarMovimentacao() {
    const selecionados = document.querySelectorAll('.pedido-checkbox:checked');
    if (selecionados.length === 0) {
        showToast("Nenhum item selecionado com o checkbox.", "info");
        return;
    }

    // Limpa a variável global e a preenche com TODOS os itens selecionados
    itensParaProducaoGlobal = [];
    selecionados.forEach(checkbox => {
        const pedido = pedidos.find(p => p.id === checkbox.dataset.pedidoId && p.sku === checkbox.dataset.sku);
        if (pedido) {
            itensParaProducaoGlobal.push(pedido);
        }
    });

    if (itensParaProducaoGlobal.length === 0) {
        showToast("Não foi possível encontrar os dados dos pedidos selecionados.", "error");
        return;
    }

    // Abre o modal de decisão com a lista completa de itens selecionados
    abrirModalImpressora();

    // *** LINHA DE CORREÇÃO ADICIONADA AQUI ***
    // Após abrir o modal e processar, desmarca todos os checkboxes para resetar a seleção.
    selecionados.forEach(checkbox => checkbox.checked = false);
    
    // Chama a função para garantir que o painel de ações seja escondido.
    atualizarPainelAcoes();
}



/**
 * Função chamada após o aviso (ou diretamente) para abrir o modal da impressora.
 */
function prosseguirParaImpressora() {
    // Esconde o modal de aviso, se estiver aberto
    document.getElementById('aviso-especial-modal').classList.add('hidden');

    // Copia os SKUs para a área de transferência
    const skusParaCopiar = [];
    itensParaProducaoGlobal.forEach(pedido => {
        const skuLimpo = pedido.sku.replace(/-(F|V|P|C)$/i, '');
        for (let i = 0; i < pedido.quantidade; i++) {
            skusParaCopiar.push(skuLimpo);
        }
    });
    
    navigator.clipboard.writeText(skusParaCopiar.join(',')).catch(err => console.error('Falha ao copiar SKUs: ', err));

    // Abre o modal da impressora
    abrirModalImpressora(itensParaProducaoGlobal.length);
}

/**
 * Renderiza ou atualiza a lista de itens dentro do modal de decisão.
 * Esta função será chamada sempre que um item for processado.
 */
function renderizarListaModal() {
    const listaItensEl = document.getElementById('impressora-modal-lista-itens');
    const contadorEl = document.getElementById('impressora-modal-contador');
    contadorEl.innerText = itensParaProducaoGlobal.length;

    if (itensParaProducaoGlobal.length === 0) {
        listaItensEl.innerHTML = '<p class="text-center text-green-600 font-semibold p-4">Todos os itens foram processados!</p>';
        // Fecha o modal automaticamente após um breve período
        setTimeout(fecharModalImpressora, 1500);
        return;
    }

    const estoquePorSku = itensEstoque.reduce((acc, item) => {
        const skuBase = item.sku.replace(/-(F|V|P|C)$/i, '');
        acc[skuBase] = (acc[skuBase] || 0) + item.qtd;
        return acc;
    }, {});

    listaItensEl.innerHTML = itensParaProducaoGlobal.map(pedido => {
        const skuBasePedido = pedido.sku.replace(/-(F|V|P|C)$/i, '');
        const estoqueDisponivel = estoquePorSku[skuBasePedido] || 0;
        const temEstoque = estoqueDisponivel >= pedido.quantidade;
        
        // Botão de Expedição só aparece se tiver estoque
        const botaoExpedicao = temEstoque ?
            `<button onclick="moverItemParaFluxo('${pedido.id}', '${pedido.sku}', false)" class="bg-teal-500 text-white px-3 py-1 rounded-md text-xs font-semibold hover:bg-teal-600">Expedição</button>` :
            '';

        return `
            <div class="flex justify-between items-center text-sm p-2 rounded-md bg-white border">
                <span class="font-semibold text-gray-800">${pedido.sku} (Qtd: ${pedido.quantidade})</span>
                <div class="flex items-center gap-2">
                    ${botaoExpedicao}
                    <button onclick="moverItemParaFluxo('${pedido.id}', '${pedido.sku}', true)" class="bg-indigo-500 text-white px-3 py-1 rounded-md text-xs font-semibold hover:bg-indigo-600">Produção</button>
                </div>
            </div>
        `;
    }).join('');
}


/**
 * Abre o modal de decisão de fluxo (impressora ou estoque), agora mostrando a lista de itens.
 */
function abrirModalImpressora() {
    const modal = document.getElementById('impressora-modal');
    const modalContent = document.getElementById('impressora-modal-content');
    const contadorEl = document.getElementById('impressora-modal-contador');
    const listaItensEl = document.getElementById('impressora-modal-lista-itens');

    // A lista de itens a processar está na variável global 'itensParaProducaoGlobal'
    contadorEl.innerText = itensParaProducaoGlobal.length;

     // Renderiza a lista de itens interativa
    renderizarListaModal();


    // Mapeia o estoque para consulta rápida
    const estoquePorSku = itensEstoque.reduce((acc, item) => {
        const skuBase = item.sku.replace(/-(F|V|P|C)$/i, '');
        acc[skuBase] = (acc[skuBase] || 0) + item.qtd;
        return acc;
    }, {});

    // Monta a lista de itens para exibir no modal
    listaItensEl.innerHTML = itensParaProducaoGlobal.map(pedido => {
        const skuBasePedido = pedido.sku.replace(/-(F|V|P|C)$/i, '');
        const estoqueDisponivel = estoquePorSku[skuBasePedido] || 0;
        const temEstoque = estoqueDisponivel >= pedido.quantidade;
        const statusClass = temEstoque ? 'text-green-600' : 'text-yellow-600';
        const statusIcon = temEstoque ? 'fa-check-circle' : 'fa-exclamation-triangle';
        const statusText = temEstoque ? `Em estoque (${estoqueDisponivel})` : 'Sem estoque';

        return `
            <div class="flex justify-between items-center text-sm p-2 rounded-md hover:bg-gray-100">
                <span class="font-semibold text-gray-800">${pedido.sku} (Qtd: ${pedido.quantidade})</span>
                <span class="${statusClass} font-medium flex items-center gap-2">
                    <i class="fas ${statusIcon}"></i>
                    ${statusText}
                </span>
            </div>
        `;
    }).join('');

    // Reseta o estado do modal
    impressoraSelecionada = null;
    document.getElementById('confirmar-impressao-btn').disabled = true;
    document.querySelectorAll('.impressora-btn').forEach(btn => btn.classList.remove('border-indigo-500', 'bg-indigo-100'));

    modal.classList.remove('hidden');
    setTimeout(() => { modalContent.classList.remove('scale-95', 'opacity-0'); modalContent.classList.add('scale-100', 'opacity-100'); }, 10);
}

function fecharModalImpressora() {
    const modal = document.getElementById('impressora-modal');
    modal.classList.add('hidden');
}

/**
 * Define a impressora selecionada e atualiza a UI do modal.
 */
function setImpressora(impressora) {
    impressoraSelecionada = impressora;
    document.querySelectorAll('.impressora-btn').forEach(btn => {
        btn.classList.remove('border-indigo-500', 'bg-indigo-100');
    });
    event.currentTarget.classList.add('border-indigo-500', 'bg-indigo-100');
    document.getElementById('confirmar-impressao-btn').disabled = false;
}



/**
 * Função para o botão "Tirar do Estoque" dentro do modal.
 * Processa apenas os itens da seleção que têm estoque disponível.
 * ESTA VERSÃO CORRIGE A VERIFICAÇÃO DE ESTOQUE COMPARANDO O SKU BASE.
 */
function tirarSelecionadosDoEstoque() {
    let itensMovidos = 0;
    let itensIgnorados = 0;

    // Itera sobre a lista global de itens que foram selecionados para o modal.
    itensParaProducaoGlobal.forEach(pedido => {
        // --- CORREÇÃO APLICADA AQUI ---
        // 1. Pega o SKU original do pedido (ex: PRCC007-F).
        const skuOriginal = pedido.sku;
        // 2. Cria o SKU base para a verificação de estoque (ex: PRCC007).
        const skuBase = skuOriginal.replace(/-(F|P|V|C)$/i, '').trim();

        // 3. Procura no estoque usando o SKU BASE.
        const estoqueDisponivel = itensEstoque
            .filter(item => item.sku === skuBase)
            .reduce((sum, item) => sum + item.qtd, 0);

        // 4. Compara o estoque encontrado com a quantidade do pedido.
        if (estoqueDisponivel >= pedido.quantidade) {
            // Se tem estoque, processa o item usando o SKU original para encontrá-lo na lista de pedidos.
            const foiMovido = moverItemParaFluxo(pedido.id, skuOriginal, false); // false = não forçar produção
            if (foiMovido) {
                itensMovidos++;
            }
        } else {
            // Se não tem estoque, conta como ignorado.
            itensIgnorados++;
        }
    });

    // Feedback para o usuário
    if (itensMovidos > 0) {
        saveData();
        let feedback = `${itensMovidos} item(ns) foram retirados do estoque e enviados para a expedição.`;
        if (itensIgnorados > 0) {
            feedback += ` ${itensIgnorados} item(ns) sem estoque foram ignorados.`;
        }
        showToast(feedback, 'success');
        // As funções de atualização de UI já são chamadas dentro de moverItemParaFluxo
    } else {
        showToast('Nenhum dos itens selecionados possuía estoque suficiente para ser retirado.', 'info');
    }
}






/**
 * Processa e cadastra os pedidos inseridos manualmente na aba "Pedidos Manuais (VC)".
 * VERSÃO CORRIGIDA: Garante que o ID do pedido seja exatamente o que foi digitado pelo usuário.
 */
function processarPedidosManuais() {
    // 1. Verifica a permissão do usuário.
    if (!hasPermission('pedidos', 'cadastrar')) {
        showToast('Você não tem permissão para cadastrar pedidos manuais.', 'error');
        return;
    }

    // 2. Coleta os dados dos campos do formulário.
    const idOriginal = document.getElementById('vc-id').value.trim();
    const skusInput = document.getElementById('vc-skus').value.trim();
    const loja = document.getElementById('vc-loja').value.trim();
    const material = document.getElementById('vc-material').value;

    // 3. Valida se os campos essenciais foram preenchidos.
    if (!idOriginal || !skusInput || !loja) {
        showToast('Por favor, preencha todos os campos: ID, SKUs e Loja.', 'error');
        return;
    }

    // 4. Lógica de parse do SKU (permanece a mesma)
    const skusArray = skusInput
        .split(',')
        .map(item => item.trim().toUpperCase())
        .filter(item => item !== '');

    if (skusArray.length === 0) {
        showToast('Nenhum SKU válido foi inserido.', 'error');
        return;
    }

    // ======================= INÍCIO DA CORREÇÃO =======================
    // Garante que o ID final comece com '#' e seja exatamente o que foi digitado.
    let idFinal = idOriginal;
    if (!idFinal.startsWith('#')) {
        idFinal = '#' + idFinal;
    }
    // A lógica que adicionava "-Date.now()" foi removida.
    // ======================== FIM DA CORREÇÃO =========================

    let pedidosAdicionados = 0;
    const idsNumericosParaCopiar = [];

    // 5. Para cada SKU na lista, cria um novo objeto de pedido.
    skusArray.forEach(sku => {
        const novoPedido = {
            id: idFinal, // Usa o ID final corrigido
            marketplace: loja,
            dataColeta: new Date().toLocaleDateString('pt-BR'),
            tipoEntrega: 'Manual',
            sku: sku,
            quantidade: 1,
            status: 'Pendente',
            material: material,
            dataImportacao: new Date().toISOString(),
            idOriginal: idOriginal // Mantém o ID sem o '#' para referência, se necessário
        };
        
        pedidos.push(novoPedido);
        pedidosAdicionados++;

        // Lógica de cópia para área de transferência (permanece a mesma)
        if (getGrupoSku(sku) === 'OUTROS') {
            const matchNumerico = sku.match(/\d+/);
            if (matchNumerico) {
                idsNumericosParaCopiar.push(matchNumerico[0]);
            }
        }
    });

    // 6. Fornece feedback, salva os dados e atualiza a tela.
    if (pedidosAdicionados > 0) {
        showToast(`${pedidosAdicionados} item(ns) do pedido manual foram cadastrados com sucesso!`, 'success');
logAction({
    acao: 'Pedido manual cadastrado',
    modulo: 'Pedidos',
    funcao: 'processarPedidosManuais',
    detalhes: { pedidoId: idFinal, skus: skusArray.join(', '), quantidade_itens: pedidosAdicionados, loja: loja }
});
        
        // Limpa TODOS os campos do formulário para o próximo cadastro.
        document.getElementById('vc-id').value = '';
        document.getElementById('vc-skus').value = '';
        document.getElementById('vc-loja').value = '';
        document.getElementById('vc-material').value = 'Nenhum';
        atualizarSkuManual();

        saveData();
        loadPedidos();
    }

    // Ação de copiar para a área de transferência (permanece a mesma)
    if (idsNumericosParaCopiar.length > 0) {
        const textoParaCopiar = [...new Set(idsNumericosParaCopiar)].join(',');
        navigator.clipboard.writeText(textoParaCopiar)
            .then(() => {
                showToast(`IDs numéricos (${textoParaCopiar}) copiados para a área de transferência!`, 'info');
            })
            .catch(err => {
                console.error('Falha ao copiar IDs: ', err);
                showToast('Erro ao tentar copiar os IDs.', 'error');
            });
    }
}










/**
 * NOVA FUNÇÃO (v2): Sugere um SKU no formulário de pedidos manuais,
 * mas permite que o usuário edite ou adicione outros SKUs.
 */
function atualizarSkuManual() {
    // 1. Pega os elementos do formulário.
    const idInput = document.getElementById('vc-id');
    const materialSelect = document.getElementById('vc-material');
    const skuInput = document.getElementById('vc-skus');

    // 2. Pega os valores atuais.
    const idValue = idInput.value.trim();
    const materialValue = materialSelect.value;
    const skuAtual = skuInput.value.trim();

    // 3. Gera o SKU sugerido (com espaço).
    let skuSugerido = '';
    if (idValue.length >= 5 && materialValue && materialValue !== 'Nenhum') {
        const idPrefixo = idValue.substring(0, 5);
        // Adiciona o espaço entre o prefixo e o material.
        skuSugerido = `${idPrefixo} ${materialValue.toUpperCase()}`;
    }

    // 4. Lógica de preenchimento inteligente:
    // Só preenche o campo se ele estiver vazio ou se o conteúdo atual for uma sugestão anterior.
    // Isso evita apagar algo que o usuário digitou manualmente.
    const sugestaoAnteriorRegex = /^\d{5}\s[A-Z]+$/; // Regex para "12345 MATERIAL"
    if (skuAtual === '' || sugestaoAnteriorRegex.test(skuAtual)) {
        skuInput.value = skuSugerido;
    }
}





/**
 * Controla a exibição das abas e filtra os erros e cancelamentos
 * para mostrar apenas os que pertencem à aba selecionada.
 * @param {'ml' | 'shopee' | 'vc'} tabName - O nome da aba para a qual o usuário deseja navegar.
 */
function showTab(tabName) {
    // ======================= LÓGICA DE EXIBIÇÃO DA NOVA ABA =========================

    // 1. Esconde o conteúdo de TODAS as abas.
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });

    // 2. Remove o estilo "ativo" de TODOS os botões de aba.
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('border-indigo-600', 'text-indigo-600');
        btn.classList.add('border-transparent', 'text-gray-500');
    });

    // 3. Mostra o conteúdo da aba selecionada.
    const contentToShow = document.getElementById(`pedidos-${tabName}-section`);
    if (contentToShow) {
        contentToShow.classList.remove('hidden');
    }

    // 4. Aplica o estilo "ativo" ao botão da aba clicada.
    const btnToActivate = document.getElementById(`tab-${tabName}`);
    if (btnToActivate) {
        btnToActivate.classList.add('border-indigo-600', 'text-indigo-600');
        btnToActivate.classList.remove('border-transparent', 'text-gray-500');
    }

    // ======================= FILTRAGEM DE ERROS PARA A ABA ATUAL (SEM TRAVAMENTO) =======================
    
    // Filtra e exibe erros e cancelamentos APENAS da aba que está sendo aberta.
    const marketplaceMap = { ml: 'Mercado Livre', shopee: 'Shopee' };
    const marketplaceAtivo = marketplaceMap[tabName];

    const errosSection = document.getElementById('pedidos-com-erro-section');
    const errosContainer = document.getElementById('pedidos-com-erro-container');
    const canceladosSection = document.getElementById('pedidos-cancelados-section');
    const canceladosContainer = document.getElementById('pedidos-cancelados-container');

    let errosDaAba = [];
    // LÓGICA DE FILTRAGEM CORRIGIDA E FINAL
    if (tabName === 'vc') {
        // Erros da aba 'VC' são aqueles cujo marketplace NÃO é 'Mercado Livre' nem 'Shopee'.
        errosDaAba = pedidosComErro.filter(erro => 
            erro.marketplace !== 'Mercado Livre' && erro.marketplace !== 'Shopee'
        );
    } else if (marketplaceAtivo) {
        // Filtra erros que pertencem EXATAMENTE ao marketplace da aba ativa.
        errosDaAba = pedidosComErro.filter(erro => erro.marketplace === marketplaceAtivo);
    }

    const canceladosDaAba = pedidos.filter(p => 
        p.status === 'Cancelado' && 
        (tabName === 'vc' ? (p.marketplace !== 'Mercado Livre' && p.marketplace !== 'Shopee') : p.marketplace === marketplaceAtivo)
    );

    // Renderiza a seção de erros SOMENTE se houver erros para a aba atual.
    if (errosDaAba.length > 0) {
        errosSection.classList.remove('hidden');
        errosContainer.innerHTML = errosDaAba.map((erro) => `
            <div class="bg-orange-100 p-4 rounded-lg shadow border-l-4 border-orange-500 flex justify-between items-center">
                <div>
                    <p class="font-bold text-orange-800">ID: ${erro.id}</p>
                    <p class="text-sm text-orange-600">${erro.motivo}</p>
                </div>
                <button onclick="removerErro(${pedidosComErro.indexOf(erro)})" class="text-orange-500 hover:text-orange-700 font-bold">X</button>
            </div>
        `).join('');
    } else {
        errosSection.classList.add('hidden');
    }

    // Renderiza a seção de cancelados SOMENTE se houver para a aba atual.
    if (canceladosDaAba.length > 0) {
        canceladosSection.classList.remove('hidden');
        canceladosContainer.innerHTML = canceladosDaAba.map(pedido => `
            <div class="bg-red-100 p-4 rounded-lg shadow border-l-4 border-red-500">
                <p class="font-bold text-red-800">${pedido.sku}</p>
                <p class="text-sm text-red-600">${pedido.id} - Qtd: ${pedido.quantidade}</p>
                <p class="text-xs font-semibold text-red-700 mt-2">VENDA CANCELADA. NÃO ENVIAR.</p>
            </div>
        `).join('');
    } else {
        canceladosSection.classList.add('hidden');
    }
}








/**
 * Função para o botão "Confirmar e Produzir" do modal.
 * Envia TODOS os itens selecionados para a produção.
 */
function moverSelecionadosParaProducao() {
    if (!impressoraSelecionada) {
        showToast("Por favor, selecione uma impressora para enviar para produção.", "error");
        return;
    }

    let itensMovidos = 0;
    
    itensParaProducaoGlobal.forEach(pedido => {
        // Chama a função de fluxo, passando a flag para forçar produção
        const foiMovido = moverItemParaFluxo(pedido.id, pedido.sku, true);
        if (foiMovido) {
            itensMovidos++;
        }
    });

    if (itensMovidos > 0) {
        saveData();
        showToast(`${itensMovidos} item(ns) foram enviados para o fluxo de produção.`, "success");
        fecharModalImpressora();
        loadPedidos();
    } else {
        
    }
}



/**
 * Verifica o estoque para os itens selecionados que precisam de produção
 * e exibe o resultado no modal da impressora.
 */
function verificarEstoqueParaProducao() {
    const selecionados = document.querySelectorAll('.pedido-checkbox:checked');
    const resultadoContainer = document.getElementById('resultado-verificacao-estoque');
    resultadoContainer.innerHTML = ''; // Limpa resultados anteriores

    const estoquePorSku = itensEstoque.reduce((acc, item) => {
        const skuBase = item.sku.replace(/-(F|V|P|C)$/i, '');
        acc[skuBase] = (acc[skuBase] || 0) + item.qtd;
        return acc;
    }, {});

    const skusParaProducao = new Set();

    selecionados.forEach(checkbox => {
        const pedido = pedidos.find(p => p.id === checkbox.dataset.pedidoId && p.sku === checkbox.dataset.sku);
        if (pedido) {
            const skuBasePedido = pedido.sku.replace(/-(F|V|P|C)$/i, '');
            const estoqueDisponivel = estoquePorSku[skuBasePedido] || 0;

            if (estoqueDisponivel < pedido.quantidade) {
                skusParaProducao.add(skuBasePedido);
            }
        }
    });

    if (skusParaProducao.size === 0) {
        resultadoContainer.innerHTML = '<p class="text-green-700 font-semibold">Todos os itens selecionados para produção já possuem estoque suficiente.</p>';
        return;
    }

    let htmlResult = '<h4 class="font-bold mb-2">Status do Estoque para Produção:</h4><ul class="space-y-1">';
    skusParaProducao.forEach(sku => {
        const estoqueAtual = estoquePorSku[sku] || 0;
        if (estoqueAtual > 0) {
            htmlResult += `<li class="text-green-600"><i class="fas fa-check-circle mr-2"></i><strong>${sku}</strong>: Possui ${estoqueAtual} em estoque.</li>`;
        } else {
            htmlResult += `<li class="text-red-600"><i class="fas fa-times-circle mr-2"></i><strong>${sku}</strong>: Sem estoque.</li>`;
        }
    });
    htmlResult += '</ul>';
    resultadoContainer.innerHTML = htmlResult;
}



// Variável global para guardar os dados do item que causou o conflito
let itemComConflito = null;

/**
 * Abre o modal de atenção para SKU duplicado.
 * @param {object} pedido - O objeto do pedido que está causando a duplicidade.
 */
function abrirModalSkuDuplicado(pedido) {
    // Guarda os dados do item com conflito para uso posterior
    itemComConflito = pedido;

    // Pega os elementos do modal
    const modal = document.getElementById('sku-duplicado-modal');
    const modalContent = document.getElementById('sku-duplicado-modal-content');
    const skuLabel = document.getElementById('sku-duplicado-label');
    const pedidoLabel = document.getElementById('pedido-duplicado-label');
    const novoSkuInput = document.getElementById('novo-sku-input');

    // Preenche as informações no modal
    skuLabel.innerText = pedido.sku;
    pedidoLabel.innerText = pedido.id;
    novoSkuInput.value = ''; // Limpa o campo de input

    // Exibe o modal com animação
    modal.classList.remove('hidden');
    setTimeout(() => {
        modalContent.classList.remove('scale-95', 'opacity-0');
        modalContent.classList.add('scale-100', 'opacity-100');
        novoSkuInput.focus();
    }, 10);
}

/**
 * Fecha o modal de atenção.
 */
function fecharModalSkuDuplicado() {
    const modal = document.getElementById('sku-duplicado-modal');
    const modalContent = document.getElementById('sku-duplicado-modal-content');

    modalContent.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        itemComConflito = null; // Limpa a variável de conflito
    }, 200);
}

/**
 * Ação do administrador para trocar o SKU e reenviar para o fluxo de produção.
 */
function trocarSkuEProcessar() {
    const novoSku = document.getElementById('novo-sku-input').value.trim().toUpperCase();

    if (!itemComConflito || !novoSku) {
        showToast('Por favor, insira um novo SKU válido.', 'error');
        return;
    }

    // Encontra o pedido original no array 'pedidos' para alterá-lo permanentemente
    const pedidoOriginal = pedidos.find(p => p.id === itemComConflito.id && p.sku === itemComConflito.sku);
    if (pedidoOriginal) {
        pedidoOriginal.sku = novoSku; // Altera o SKU
        showToast(`SKU alterado para ${novoSku}. Reenviando para o fluxo...`, 'success');
        logAction(`Admin trocou SKU de ${itemComConflito.sku} para ${novoSku} no pedido ${itemComConflito.id}`);
        
        // Salva a alteração
        saveData();
        
        // Fecha o modal e tenta processar o item novamente, agora com o SKU correto
        fecharModalSkuDuplicado();
        confirmarMovimentacao(); // Chama a função principal de movimentação novamente
    } else {
        showToast('Erro: não foi possível encontrar o pedido original para alterar.', 'error');
    }
}

/**
 * Ação do administrador para autorizar a duplicidade e forçar o envio.
 */
function autorizarDuplicidadeEProcessar() {
    if (!itemComConflito) return;

    showToast('Duplicidade autorizada pelo administrador. Enviando item...', 'info');
    logAction(`Admin autorizou a duplicidade do SKU ${itemComConflito.sku} para o pedido ${itemComConflito.id}`);

    // Chama a função de fluxo, mas com um parâmetro extra para ignorar a verificação de duplicidade
    moverItemParaFluxo(itemComConflito.id, itemComConflito.sku, true, true); // forcarProducao=true, ignorarDuplicidade=true

    // Fecha o modal
    fecharModalSkuDuplicado();
}






/**
 * Lógica centralizada para mover UM item para o fluxo correto.
 * VERSÃO FINAL: Bloqueia a segunda unidade e exige autorização de um admin.
 *
 * @param {string} pedidoId - O ID do pedido.
 * @param {string} sku - O SKU do item.
 * @param {boolean} forcarProducao - Se true, envia para produção.
 */
function moverItemParaFluxo(pedidoId, sku, forcarProducao = false) {
    const pedidoIndex = pedidos.findIndex(p => p.id === pedidoId && p.sku === sku && (p.status === 'Pendente' || p.status === 'Pendente-Atenção'));

    if (pedidoIndex === -1) {
        showToast(`Item ${sku} já foi processado ou não foi encontrado.`, 'error');
        return false;
    }

    const pedido = pedidos[pedidoIndex];
    const isAdmin = currentUser.role === 'admin-master' || currentUser.role === 'admin-setor';

    // --- LÓGICA DE BLOQUEIO E AUTORIZAÇÃO COM PERMISSÃO ---
    if (pedido.status === 'Pendente-Atenção') {
        if (isAdmin) {
            // Se for admin, abre o modal de autorização.
            abrirModalAutorizacao(pedido);
        } else {
            // Se não for admin, apenas exibe um alerta e bloqueia.
            showToast('Ação bloqueada. A segunda unidade requer confirmação de um administrador.', 'error');
        }
        return false; // Interrompe o fluxo em ambos os casos.
    }
    // --- FIM DA LÓGICA DE BLOQUEIO ---

    // Se a quantidade do pedido for maior que 1, divide o pedido.
    if (pedido.quantidade > 1) {
        pedido.quantidade -= 1;
        pedido.status = 'Pendente-Atenção'; // Marca o restante para atenção

        const itemParaMover = { ...pedido, quantidade: 1, status: 'Pendente' };
        processarItemUnico(itemParaMover, forcarProducao);

    } else {
        // Se a quantidade for 1, processa normalmente.
        const [itemParaMover] = pedidos.splice(pedidoIndex, 1);
        processarItemUnico(itemParaMover, forcarProducao);
    }

    // Remove o item da lista do modal, pois uma unidade foi tratada.
    itensParaProducaoGlobal = itensParaProducaoGlobal.filter(p => !(p.id === pedidoId && p.sku === sku));
    
    saveData();
    renderizarListaModal();
    loadPedidos();
    return true;
}


/**
 * Função auxiliar para processar um único item (com quantidade 1).
 * (Esta função permanece a mesma da resposta anterior, não precisa ser alterada se você já a copiou)
 */
function processarItemUnico(item, forcarProducao) {
    const estoqueDisponivel = itensEstoque.filter(i => i.sku === item.sku).reduce((sum, i) => sum + i.qtd, 0);
    const temEstoque = estoqueDisponivel >= item.quantidade;

    if (forcarProducao) {
        if (!impressoraSelecionada) {
            showToast("Por favor, selecione uma impressora.", "error");
            return;
        }
        
        producao.push({
            op: `OP-${Date.now()}-${Math.random()}`,
            pedidoId: item.id,
            sku: item.sku,
            quantidade: 1,
            status: 'Aguardando Impressão',
            impressora: impressoraSelecionada,
            tipoEntrega: item.tipoEntrega,
            dataColeta: item.dataColeta,
            marketplace: item.marketplace
        });
        
        historicoArtes.unshift({
            id: `ART-${Date.now()}`,
            sku: item.sku,
            quantidade: 1,
            impressora: impressoraSelecionada,
            usuario: currentUser.username,
            timestamp: new Date().toISOString()
        });
        
        pedidos.push({
            ...item,
            status: 'Processado',
            destino: 'Produção',
            impressora: impressoraSelecionada,
            usuario: currentUser.username,
            dataProcessamento: new Date().toISOString()
        });

// ... antes do showToast
logAction({
    acao: 'Item enviado para Produção',
    modulo: 'Pedidos',
    funcao: 'processarItemUnico',
    detalhes: { sku: item.sku, pedidoId: item.id, impressora: impressoraSelecionada }
});
showToast(`1x ${item.sku} enviado para a Produção.`, 'success');

    } else { // Lógica para expedição
        if (!temEstoque) {
// ... antes do showToast
logAction({
    acao: 'Item enviado para Expedição (do Estoque)',
    modulo: 'Pedidos',
    funcao: 'processarItemUnico',
    detalhes: { sku: item.sku, pedidoId: item.id }
});
showToast(`1x ${item.sku} enviado para a Expedição.`, 'success');
            return;
        }
        
        let prateleiras = itensEstoque.filter(i => i.sku === item.sku && i.qtd > 0);
        if (prateleiras.length > 0) {
            prateleiras[0].qtd -= 1;
            registrarTransacao(prateleiras[0].sku, -1, 'VENDA', prateleiras[0].prateleira, `Pedido ${item.id}`);
        }
        
        expedicao.push({
            id: `EXP-${Date.now()}`,
            lote: `LOTE-${Date.now()}`,
            sku: item.sku,
            status: 'Pronto para Envio',
            pedidoId: item.id,
            marketplace: item.marketplace,
        });

        pedidos.push({
            ...item,
            status: 'Processado',
            destino: 'Expedição',
            usuario: currentUser.username,
            dataProcessamento: new Date().toISOString()
        });
        

        showToast(`1x ${item.sku} enviado para a Expedição.`, 'success');
    }
}

/**
 * Abre o modal de seleção de impressora para um ÚNICO item.
 * Usado após a autorização da segunda unidade.
 * @param {object} item - O objeto do item que foi autorizado.
 */
function abrirModalImpressoraParaItemUnico(item) {
    // Define a variável global com apenas o item autorizado
    itensParaProducaoGlobal = [item];

    // Abre o modal de seleção de impressora
    const modal = document.getElementById('impressora-modal');
    const modalContent = document.getElementById('impressora-modal-content');
    const contadorEl = document.getElementById('impressora-modal-contador');
    const listaItensEl = document.getElementById('impressora-modal-lista-itens');

    // Atualiza a contagem e a lista para mostrar apenas o item autorizado
    contadorEl.innerText = '1';
    listaItensEl.innerHTML = `
        <div class="flex justify-between items-center text-sm p-2 rounded-md bg-white border">
            <span class="font-semibold text-gray-800">${item.sku} (Qtd: ${item.quantidade})</span>
            <span class="text-green-600 font-medium flex items-center gap-2">
                <i class="fas fa-check-circle"></i>
                Autorizado para Produção
            </span>
        </div>
    `;

    // Reseta o estado do modal para uma nova seleção
    impressoraSelecionada = null;
    document.getElementById('confirmar-impressao-btn').disabled = true;
    document.querySelectorAll('.impressora-btn').forEach(btn => btn.classList.remove('border-indigo-500', 'bg-indigo-100'));
    
    // Desabilita a opção de "Tirar do Estoque", pois a decisão já é produzir
    const btnEstoque = modal.querySelector('button[onclick="tirarSelecionadosDoEstoque()"]');
    if (btnEstoque) {
        btnEstoque.disabled = true;
        btnEstoque.parentElement.classList.add('opacity-50');
    }


    // Abre o modal
    modal.classList.remove('hidden');
    setTimeout(() => { modalContent.classList.remove('scale-95', 'opacity-0'); modalContent.classList.add('scale-100', 'opacity-100'); }, 10);
}



/**
 * Ação do admin: autoriza a segunda unidade, revertendo seu status para 'Pendente'.
 * O item agora pode ser selecionado e processado normalmente.
 */
function autorizarEProcessarSegundaUnidade() {
    if (!itemPendenteAutorizacao) return;

    const { id, sku } = itemPendenteAutorizacao;

    // Encontra o item original no array de pedidos para mudar seu status.
    const pedidoIndex = pedidos.findIndex(p => p.id === id && p.sku === sku && p.status === 'Pendente-Atenção');
    
    if (pedidoIndex !== -1) {
        // --- A MÁGICA ACONTECE AQUI ---
        // Apenas muda o status de volta para 'Pendente'.
        pedidos[pedidoIndex].status = 'Pendente';
        
        saveData();
        logAction(`Admin autorizou a 2ª unidade do SKU ${sku} para o pedido ${id}. Item desbloqueado.`);
        showToast('Item desbloqueado! Agora você pode selecioná-lo para a baixa.', 'success');
        
        // Recarrega a tela de pedidos para que o card mude de cor e o checkbox se torne funcional.
        loadPedidos();
    } else {
        showToast('Erro: Item pendente de autorização não encontrado.', 'error');
    }

    fecharModalAutorizacao();
}



/**
 * Abre o modal da Lista de Separação.
 */
function abrirModalListaSeparacao() {
    const modal = document.getElementById('relatorio-saida-modal');
    const modalContent = document.getElementById('relatorio-saida-content');
    const tituloEl = document.getElementById('relatorio-modal-titulo');
    const dataEl = document.getElementById('relatorio-modal-data');
    const descricaoEl = document.getElementById('relatorio-modal-descricao');
    const mlContainer = document.getElementById('relatorio-ml-container');
    const shopeeContainer = document.getElementById('relatorio-shopee-container');
    
    // **NOVO**: Adiciona um container para a seção "VC" se ele ainda não existir no HTML.
    // Isso garante que o código funcione sem precisar alterar o index.html.
    let vcSection = document.getElementById('relatorio-vc-section');
    if (!vcSection) {
        // Insere a nova seção "VC" logo após a seção da Shopee.
        shopeeContainer.parentElement.insertAdjacentHTML('afterend', `
            <div id="relatorio-vc-section" class="mt-6">
                <h3 class="text-xl font-bold text-gray-800 mb-3 flex items-center">
                    <i class="fas fa-star mr-3 text-cyan-500"></i>VC (Venda Direta/Outros)
                </h3>
                <div id="relatorio-vc-container" class="space-y-4"></div>
            </div>
        `);
    }
    const vcContainer = document.getElementById('relatorio-vc-container');

    // Esconde o botão de arquivar, como no seu código original.
    const btnArquivar = modal.querySelector('button[onclick^="arquivar"]');
    if(btnArquivar) btnArquivar.classList.add('hidden');

    // Atualiza os textos do cabeçalho do modal.
    tituloEl.innerText = 'Lista de Separação por Marketplace (Picking)';
    dataEl.innerText = `Gerado em: ${new Date().toLocaleString('pt-BR')}`;
    descricaoEl.innerHTML = `<i class="fas fa-boxes mr-2 text-blue-500"></i>Esta é a lista de itens que precisam ser retirados do estoque para a expedição, organizada por origem.`;

    // 1. **FILTRO PRINCIPAL**: Pega APENAS os pedidos que foram processados para sair do estoque.
    const pedidosParaSeparar = pedidos.filter(p => p.status === 'Processado' && p.destino === 'Expedição');
    
    // 2. **SEPARAÇÃO EM 3 GRUPOS**:
    //    - Primeiro, pega todos os pedidos cujo SKU começa com "VC".
    //    - Depois, pega os de ML e Shopee, garantindo que não sejam os de "VC".
    const relatorioVC = pedidosParaSeparar.filter(p => p.sku.toUpperCase().startsWith('VC'));
    const relatorioML = pedidosParaSeparar.filter(p => p.marketplace === 'Mercado Livre' && !p.sku.toUpperCase().startsWith('VC'));
    const relatorioShopee = pedidosParaSeparar.filter(p => p.marketplace === 'Shopee' && !p.sku.toUpperCase().startsWith('VC'));

    // 3. Renderiza cada seção com sua lista de pedidos correspondente.
    //    A função 'renderizarSecaoListaSeparacao' fará a mágica de criar a tabela detalhada.
    mlContainer.innerHTML = renderizarSecaoListaSeparacao(relatorioML);
    shopeeContainer.innerHTML = renderizarSecaoListaSeparacao(relatorioShopee);
    vcContainer.innerHTML = renderizarSecaoListaSeparacao(relatorioVC);

    // Abre o modal.
    modal.classList.remove('hidden');
    setTimeout(() => { modalContent.classList.remove('scale-95', 'opacity-0'); modalContent.classList.add('scale-100', 'opacity-100'); }, 10);
}


/**
 * Renderiza uma seção da lista de separação como uma tabela detalhada.
 * A função agora busca as prateleiras de forma inteligente para cada SKU.
 * @param {Array} listaPedidos - A lista de pedidos para um grupo específico (ML, Shopee ou VC).
 * @returns {string} O HTML da tabela de separação ou uma mensagem de "nenhum item".
 */
function renderizarSecaoListaSeparacao(listaPedidos) {
    if (listaPedidos.length === 0) {
        return '<p class="text-center text-gray-500 py-4">Nenhum item para separar neste grupo.</p>';
    }

    // 1. Agrupa os pedidos por SKU para somar as quantidades totais.
    const agrupadoPorSku = listaPedidos.reduce((acc, p) => {
        const skuBase = p.sku.replace(/-(F|P|V|C)$/i, '').trim();
        if (!acc[skuBase]) {
            acc[skuBase] = {
                quantidadeTotal: 0,
                pedidos: []
            };
        }
        acc[skuBase].quantidadeTotal += p.quantidade;
        acc[skuBase].pedidos.push(p);
        return acc;
    }, {});

    // 2. Para cada SKU, encontra as prateleiras de onde os itens devem ser retirados.
    Object.keys(agrupadoPorSku).forEach(sku => {
        let quantidadeNecessaria = agrupadoPorSku[sku].quantidadeTotal;
        
        const prateleirasDisponiveis = itensEstoque
            .filter(item => item.sku === sku && item.qtd > 0)
            .sort((a, b) => a.prateleira.localeCompare(b.prateleira));

        const locaisDeRetirada = [];
        
        // Simula a baixa de estoque para encontrar as prateleiras corretas
        for (const prateleira of prateleirasDisponiveis) {
            if (quantidadeNecessaria <= 0) break;
            
            const qtdARetirar = Math.min(quantidadeNecessaria, prateleira.qtd);
            locaisDeRetirada.push(`<b>${prateleira.prateleira}</b> (tirar ${qtdARetirar})`);
            quantidadeNecessaria -= qtdARetirar;
        }

        if (quantidadeNecessaria > 0) {
            locaisDeRetirada.push(`<span class="text-red-500 font-bold">FALTA EM ESTOQUE: ${quantidadeNecessaria}</span>`);
        }

        agrupadoPorSku[sku].locaisDeRetirada = locaisDeRetirada.join('  ');
    });

    // 3. Monta a tabela HTML com todas as informações.
    let html = `
        <div class="overflow-x-auto bg-white p-4 rounded-lg shadow-md">
            <table class="w-full text-sm text-left">
                <thead class="bg-gray-100">
                    <tr>
                        <th class="p-3 font-semibold">SKU</th>
                        <th class="p-3 font-semibold text-center">Qtd.</th>
                        <th class="p-3 font-semibold">Localização (Prateleira)</th>
                        <th class="p-3 font-semibold">Horário</th>
                    </tr>
                </thead>
                <tbody>
    `;

    Object.keys(agrupadoPorSku).sort().forEach(sku => {
        const info = agrupadoPorSku[sku];
        const dataProcessamento = new Date(info.pedidos[0].dataProcessamento).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
        });

        html += `
            <tr class="border-b last:border-b-0 hover:bg-indigo-50">
                <td class="p-3 font-bold text-indigo-800">${sku}</td>
                <td class="p-3 font-bold text-center text-lg">${info.quantidadeTotal}</td>
                <td class="p-3 font-mono text-green-800">${info.locaisDeRetirada}</td>
                <td class="p-3 text-gray-600">${dataProcessamento}</td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;
    return html;
}


function fecharModalRelatorioSaida() {
    const modal = document.getElementById('relatorio-saida-modal');
    modal.classList.add('hidden');
}

/**
 * Abre e renderiza o modal de Histórico de Pedidos.
 */
function abrirModalHistorico() {
    historicoPaginaAtual = 1;
    const modal = document.getElementById('historico-modal');
    const modalContent = document.getElementById('historico-modal-content');
    renderizarHistorico();
    modal.classList.remove('hidden');
    setTimeout(() => { modalContent.classList.remove('scale-95', 'opacity-0'); modalContent.classList.add('scale-100', 'opacity-100'); }, 10);
}

function fecharModalHistorico() {
    const modal = document.getElementById('historico-modal');
    modal.classList.add('hidden');
}

/**
 * Renderiza o modal de Histórico de Pedidos, agora com a coluna de Destino/Impressora.
 */
function renderizarHistorico() {
    const body = document.getElementById('historico-table-body');
    const tableHead = document.querySelector('#historico-modal table thead tr');
    const filtroId = document.getElementById('hist-filtro-id').value.toLowerCase();
    const filtroMarketplace = document.getElementById('hist-filtro-marketplace').value;
    const filtroUsuario = document.getElementById('hist-filtro-usuario').value.toLowerCase();

    // Ajusta o cabeçalho da tabela para incluir a nova coluna
    tableHead.innerHTML = `
        <th class="p-2">ID Pedido</th>
        <th class="p-2">SKU</th>
        <th class="p-2">Marketplace</th>
        <th class="p-2">Destino / Impressora</th>
        <th class="p-2">Entrega</th> <!-- NOVA COLUNA -->
        <th class="p-2">Usuário</th>
        <th class="p-2">Data</th>
        <th class="p-2">Ações</th>
    `;

    let pedidosProcessados = pedidos
        .filter(p => p.status === 'Processado')
        .sort((a, b) => new Date(b.dataProcessamento) - new Date(a.dataProcessamento));

    const filtrados = pedidosProcessados.filter(p => {
        const idMatch = p.id.toLowerCase().includes(filtroId) || p.sku.toLowerCase().includes(filtroId);
        const marketplaceMatch = !filtroMarketplace || p.marketplace === filtroMarketplace;
        const usuarioMatch = !filtroUsuario || (p.usuario && p.usuario.toLowerCase().includes(filtroUsuario));
        return idMatch && marketplaceMatch && usuarioMatch;
    });

    body.innerHTML = '';
    if (filtrados.length === 0) {
        body.innerHTML = `<tr><td colspan="8" class="text-center p-8 text-gray-500">Nenhum pedido encontrado.</td></tr>`;
        return;
    }

    const itensDaPagina = filtrados;

    itensDaPagina.forEach(p => {
        let destinoDisplay = '';
        let destinoClass = '';
        let entregaClass = p.tipoEntrega === 'Motoboy' ? 'text-purple-700 font-semibold' : 'text-gray-600';

        if (p.destino === 'Produção') {
            destinoDisplay = `Produção (Imp. ${p.impressora || 'N/A'})`;
            destinoClass = 'text-blue-600';
        } else {
            destinoDisplay = 'Expedição';
            destinoClass = 'text-green-600';
        }

        body.innerHTML += `
            <tr class="border-b hover:bg-gray-50">
                <td class="p-2">${p.id}</td>
                <td class="p-2 font-semibold">${p.sku}</td>
                <td class="p-2">${p.marketplace}</td>
                <td class="p-2 font-bold ${destinoClass}">${destinoDisplay}</td>
                <td class="p-2 ${entregaClass}">${p.tipoEntrega || 'N/A'}</td>
                <td class="p-2">${p.usuario || 'N/A'}</td>
                <td class="p-2">${new Date(p.dataProcessamento).toLocaleString('pt-BR')}</td>
                <td class="p-2">
                    <button onclick="reverterPedido('${p.id}', '${p.sku}')" class="text-red-500 hover:text-red-700" title="Reverter para Pendente"><i class="fas fa-undo"></i></button>
                </td>
            </tr>
        `;
    });
}


function mudarPaginaHistorico(direcao) {
    historicoPaginaAtual += direcao;
    renderizarHistorico();
}

/**
 * Reverte um pedido do status 'Processado' para 'Pendente'.
 */
function reverterPedido(pedidoId, sku) {
    const senha = prompt("Para reverter o pedido, digite a senha de administrador:");
    if (senha !== "W2025") {
        showToast("Senha incorreta!", "error");
        return;
    }

    const pedidoIndex = pedidos.findIndex(p => p.id === pedidoId && p.sku === sku && p.status === 'Processado');
    if (pedidoIndex === -1) {
        showToast("Pedido não encontrado ou já está pendente.", "error");
        return;
    }

    const pedido = pedidos[pedidoIndex];
    pedido.status = 'Pendente';
    delete pedido.destino;
    delete pedido.usuario;
    delete pedido.dataProcessamento;
    delete pedido.impressora;

    producao = producao.filter(p => !(p.pedidoId === pedidoId && p.sku === sku));
    expedicao = expedicao.filter(e => !(e.pedidoId === pedidoId && e.sku === sku));

    saveData();
    showToast(`Pedido ${sku} revertido para pendente.`, "success");
    renderizarHistorico();
    loadPedidos();
}





// =================================================================================
// FUNÇÕES DO MODAL DE HISTÓRICO DE ARTES
// =================================================================================

/**
 * Abre o modal do histórico completo de artes.
 */
function openArtHistoryModal() {
    const modal = document.getElementById('art-history-modal');
    const modalContent = document.getElementById('art-history-modal-content');
    
    // Limpa os filtros antes de abrir
    document.getElementById('art-history-filter-sku').value = '';
    document.getElementById('art-history-filter-impressora').value = '';
    document.getElementById('art-history-filter-data').value = '';

    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    
    // Renderiza o conteúdo do modal com todos os dados (sem filtros)
    renderArtHistoryModal();

    setTimeout(() => {
        modalContent.classList.remove('scale-95', 'opacity-0');
        modalContent.classList.add('scale-100', 'opacity-100');
    }, 10);
}

/**
 * Fecha o modal do histórico completo de artes.
 */
function closeArtHistoryModal() {
    const modal = document.getElementById('art-history-modal');
    const modalContent = document.getElementById('art-history-modal-content');
    
    modalContent.classList.add('scale-95', 'opacity-0');
    modalContent.classList.remove('scale-100', 'opacity-100');
    
    setTimeout(() => {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }, 200);
}

/**
 * Filtra e renderiza os dados na tabela do modal de histórico de artes.
 */
function renderArtHistoryModal() {
    const tableBody = document.getElementById('art-history-modal-table')?.querySelector('tbody');
    if (!tableBody) return;

    // Pega os valores dos filtros
    const filterSku = document.getElementById('art-history-filter-sku').value.trim().toLowerCase();
    const filterImpressora = document.getElementById('art-history-filter-impressora').value;
    const filterData = document.getElementById('art-history-filter-data').value;

    // Filtra o array completo 'historicoArtes'
    const historicoFiltrado = historicoArtes.filter(item => {
        const skuMatch = !filterSku || item.sku.toLowerCase().includes(filterSku);
        const impressoraMatch = !filterImpressora || item.impressora === filterImpressora;
        
        let dataMatch = true;
        if (filterData) {
            const itemDate = new Date(item.timestamp).toLocaleDateString('en-CA'); // Formato YYYY-MM-DD
            dataMatch = itemDate === filterData;
        }

        return skuMatch && impressoraMatch && dataMatch;
    });

    // Renderiza a tabela
    if (historicoFiltrado.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center p-8 text-gray-500">Nenhum registro encontrado com os filtros aplicados.</td></tr>`;
    } else {
        tableBody.innerHTML = historicoFiltrado.map(item => `
            <tr class="border-b hover:bg-gray-100">
                <td class="p-3 text-sm text-gray-600">${new Date(item.timestamp).toLocaleString('pt-BR')}</td>
                <td class="p-3 text-sm font-semibold text-indigo-700">${item.sku}</td>
                <td class="p-3 text-sm font-bold text-center">${item.quantidade}</td>
                <td class="p-3 text-sm text-center">Imp. ${item.impressora}</td>
                <td class="p-3 text-sm text-gray-700">${item.usuario}</td>
            </tr>
        `).join('');
    }
}









// =================================================================================
// MÓDULO DE COSTURA (LÓGICA COMPLETA E ATUALIZADA)
// =================================================================================

function loadCostura() {
    if (!hasPermission('costura', 'visualizar')) return;

    const contadorTotal = document.getElementById('contador-costura-total');
    const contadorML = document.getElementById('contador-costura-ml');
    const contadorShopee = document.getElementById('contador-costura-shopee');
    const contadorVC = document.getElementById('contador-costura-vc');
    const containerML = document.getElementById('costura-ml-content');
    const containerShopee = document.getElementById('costura-shopee-content');
    const containerVC = document.getElementById('costura-vc-content');

    if (!containerML || !containerShopee || !containerVC) return;
    containerML.innerHTML = '';
    containerShopee.innerHTML = '';
    containerVC.innerHTML = '';

    const gruposPermitidos = currentUser.gruposCostura || [];
    const isAdmin = currentUser.role === 'admin-master' || currentUser.role === 'admin-setor';
    
    const costuraVisivel = costura.filter(item => 
        isAdmin || gruposPermitidos.length === 0 || (gruposPermitidos.includes(getGrupoSku(item.sku)))
    );

    contadorTotal.innerText = costuraVisivel.length;

    const costuraML = costuraVisivel.filter(p => p.marketplace === 'Mercado Livre');
    const costuraShopee = costuraVisivel.filter(p => p.marketplace === 'Shopee');
    const costuraVC = costuraVisivel.filter(p => p.marketplace !== 'Mercado Livre' && p.marketplace !== 'Shopee');

    contadorML.innerText = costuraML.length;
    contadorShopee.innerText = costuraShopee.length;
    contadorVC.innerText = costuraVC.length;

    renderizarGruposCosturaPorAba(costuraML, containerML);
    renderizarGruposCosturaPorAba(costuraShopee, containerShopee);
    renderizarGruposCosturaPorAba(costuraVC, containerVC);
    
    applyPermissionsToUI();
}

function renderizarGruposCosturaPorAba(listaItens, containerAba) {
    if (listaItens.length === 0) {
        containerAba.innerHTML = '<p class="text-center text-gray-500 text-lg py-16">A fila de costura para esta origem está vazia.</p>';
        return;
    }

    const costuraAgrupada = listaItens.reduce((acc, item) => {
        const grupo = getGrupoSku(item.sku);
        if (!acc[grupo]) acc[grupo] = [];
        acc[grupo].push(item);
        return acc;
    }, {});

    const ordemGrupos = ['CL', 'FF', 'KC', 'KD', 'PC', 'PH', 'PR', 'PV', 'PV-ESPECIAL', 'RV', 'TP', 'VC', 'PA', 'OUTROS'];
    containerAba.innerHTML = '';
    ordemGrupos.forEach(grupo => {
        if (costuraAgrupada[grupo]) {
            renderGrupoCostura(grupo, costuraAgrupada[grupo], containerAba);
        }
    });
}

function renderGrupoCostura(nomeGrupo, itensGrupo, containerPai) {
    itensGrupo.sort((a, b) => a.sku.localeCompare(b.sku));
    const grupoHtml = `
        <div class="bg-white/90 p-6 rounded-2xl shadow-xl">
            <h3 class="text-2xl font-bold text-gray-800 mb-6 border-b pb-4">Grupo: ${nomeGrupo}</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                ${itensGrupo.map(renderCardsCostura).join('')}
            </div>
        </div>
    `;
    containerPai.innerHTML += grupoHtml;
}

function showCosturaTab(tabName) {
    document.querySelectorAll('.costura-tab-content').forEach(content => {
        content.classList.add('hidden');
    });

    document.querySelectorAll('.costura-tab-btn').forEach(btn => {
        btn.classList.remove('border-purple-600', 'text-purple-600');
        btn.classList.add('border-transparent', 'text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');
    });

    const contentToShow = document.getElementById(`costura-${tabName}-content`);
    if (contentToShow) {
        contentToShow.classList.remove('hidden');
    }

    const btnToActivate = document.getElementById(`tab-costura-${tabName}`);
    if (btnToActivate) {
        btnToActivate.classList.add('border-purple-600', 'text-purple-600');
        btnToActivate.classList.remove('border-transparent', 'text-gray-500');
    }
}

//=================================================================================
// SUBSTITUA ESTA FUNÇÃO NO SEU SCRIPT.JS
//=================================================================================
function renderCardsCostura(item) {
    const imageMap = images.reduce((acc, img) => ({ ...acc, [img.nome.toUpperCase()]: img.url }), {});
    const imageUrl = imageMap[item.sku.toUpperCase()] || CAMINHO_IMAGEM_TESTE;

    const isMotoboy = item.tipoEntrega === 'Motoboy';
    const cardClasses = isMotoboy ? 'motoboy-card' : 'bg-white border-gray-200';
    const tipoEntregaIcon = isMotoboy ? 'fa-motorcycle text-purple-700' : 'fa-box-open text-gray-500';
    const dataColetaClass = isMotoboy ? 'text-purple-700 font-bold animate-pulse' : 'text-gray-600';

    const isEmAndamento = item.status === 'Em Andamento';
    const isFinalizado = item.status === 'Finalizado';
    const isDoUsuario = item.usuarioInicio === currentUser.username;
    const isAdmin = currentUser.role === 'admin-master' || currentUser.role === 'admin-setor';

    let buttonHtml = '';
    let statusText = '';

    if (isFinalizado) {
        statusText = `<span class="text-xs font-semibold text-green-700">Finalizado por: ${item.usuarioFim || 'N/A'}</span>`;
        if (isAdmin || item.usuarioFim === currentUser.username) {
            buttonHtml = `<button onclick="forcarEnvioParaExpedicao('${item.lote}')" class="w-full bg-purple-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-purple-700 animate-pulse">
                            <i class="fas fa-shipping-fast mr-2"></i>Forçar Envio p/ Expedição
                          </button>`;
        } else {
            buttonHtml = `<button class="w-full bg-gray-400 text-white px-4 py-2 rounded-lg cursor-not-allowed" disabled>
                            <i class="fas fa-check-double mr-2"></i>Finalizado
                          </button>`;
        }
    } else if (isEmAndamento) {
        statusText = `<span class="text-xs font-semibold text-blue-700">Em uso por: ${item.usuarioInicio}</span>`;
        if (isDoUsuario || isAdmin) {
            buttonHtml = `<button onclick="iniciarTarefaCostura('${item.lote}')" class="w-full bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700"><i class="fas fa-play-circle mr-2"></i>Continuar Tarefa</button>`;
        } else {
            buttonHtml = `<button class="w-full bg-gray-400 text-white px-4 py-2 rounded-lg cursor-not-allowed" disabled><i class="fas fa-lock mr-2"></i>Em uso por ${item.usuarioInicio}</button>`;
        }
    } else { // Aguardando
        statusText = `<span class="text-xs font-semibold text-gray-500">Aguardando início</span>`;
        buttonHtml = `<button onclick="iniciarTarefaCostura('${item.lote}')" class="w-full bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700"><i class="fas fa-play mr-2"></i>Iniciar Trabalho</button>`;
    }

    return `
        <div class="costura-card p-4 rounded-xl shadow-md border flex flex-col justify-between transition-all hover:shadow-lg hover:scale-[1.02] ${cardClasses}">
            <div>
                <img src="${imageUrl}" alt="Arte para ${item.sku}" class="w-full h-40 object-cover rounded-lg mb-3 cursor-pointer" onclick="openImageZoomModal('${imageUrl}')">
                <p class="font-bold text-xl text-gray-800 truncate" title="${item.sku}">${item.sku}</p>
                <div class="flex justify-between items-center text-sm mt-2">
                    <span class="font-semibold ${dataColetaClass}"><i class="fas fa-calendar-alt mr-2"></i>${item.dataColeta || 'Sem data'}</span>
                    <span class="font-semibold flex items-center gap-2"><i class="fas ${tipoEntregaIcon}"></i>${item.tipoEntrega || 'Padrão'}</span>
                </div>
                <div class="text-right mt-1">${statusText}</div>
            </div>
            <div class="mt-4">
                ${buttonHtml}
            </div>
        </div>
    `;
}


function forcarEnvioParaExpedicao(loteId) {
    const itemIndex = costura.findIndex(c => c.lote === loteId);
    if (itemIndex === -1) {
        return showToast('Erro: Lote não encontrado para forçar o envio.', 'error');
    }

    const item = costura[itemIndex];
    const isDoUsuario = item.usuario === currentUser.username;
    const isAdmin = currentUser.role === 'admin-master' || currentUser.role === 'admin-setor';

    if (!isAdmin && !isDoUsuario) {
        return showToast('Apenas um administrador ou o usuário que finalizou a tarefa pode forçar o envio.', 'error');
    }

    if (confirm(`Tem certeza que deseja forçar o envio do lote ${loteId} para a expedição?`)) {
        const [itemMovido] = costura.splice(itemIndex, 1);
        
        expedicao.push({
            id: `EXP-${Date.now()}`,
            lote: itemMovido.lote,
            op: itemMovido.op,
            sku: itemMovido.sku,
            status: 'Pronto para Envio',
            pedidoId: itemMovido.pedidoId,
            marketplace: itemMovido.marketplace,
            tipoEntrega: itemMovido.tipoEntrega,
            dataExpedicao: new Date().toISOString(),
            tempoCostura: itemMovido.tempoCostura || 'N/A'
        });

        saveData();
        loadCostura();
        
        if (tarefaCosturaAtiva && tarefaCosturaAtiva.lote === loteId) {
            tarefaCosturaAtiva = null;
        }

        showToast(`Lote ${loteId} enviado para a expedição com sucesso!`, 'success');
logAction({
    acao: 'Envio para Expedição forçado (Admin)',
    modulo: 'Costura',
    funcao: 'forcarEnvioParaExpedicao',
    detalhes: { lote: item.lote, sku: item.sku, pedidoId: item.pedidoId }
});
    }
}

//=================================================================================
// SUBSTITUA ESTE BLOCO INTEIRO DE FUNÇÕES NO SEU SCRIPT.JS
//=================================================================================

function iniciarTarefaCostura(loteId) {
    if (tarefaCosturaAtiva && tarefaCosturaAtiva.lote !== loteId) {
        showToast(`Finalize a tarefa do lote ${tarefaCosturaAtiva.lote} antes de iniciar outra.`, 'error');
        return;
    }

    const item = costura.find(c => c.lote === loteId);
    if (!item) return showToast('Lote não encontrado.', 'error');

    if (item.usuarioInicio && item.usuarioInicio !== currentUser.username && item.status !== 'Finalizado') {
        return showToast(`Este lote já está sendo trabalhado por ${item.usuarioInicio}.`, 'error');
    }

    tarefaCosturaAtiva = {
        lote: loteId,
        sku: item.sku,
        marketplace: item.marketplace,
    };

    const infoContainer = document.getElementById('tarefa-info-container');
    const marketplaceCores = {
        'Mercado Livre': 'bg-yellow-400 text-yellow-900',
        'Shopee': 'bg-orange-500 text-white',
    };
    const corPadrao = 'bg-cyan-500 text-white';
    const corMarketplace = marketplaceCores[item.marketplace] || corPadrao;

    infoContainer.innerHTML = `
        <span class="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full">SKU: <strong class="font-bold">${item.sku}</strong></span>
        <span class="px-3 py-1 rounded-full ${corMarketplace}">${item.marketplace}</span>
    `;

    const imageMap = images.reduce((acc, img) => ({ ...acc, [img.nome.toUpperCase()]: img.url }), {});
    document.getElementById('tarefa-imagem-sku').src = imageMap[item.sku.toUpperCase()] || CAMINHO_IMAGEM_TESTE;
    
    const btnIniciar = document.getElementById('btn-iniciar-trabalho');
    const btnEnviar = document.getElementById('btn-enviar-expedicao');
    
    // O botão "Finalizar Lote" é sempre escondido.
    document.getElementById('btn-finalizar-costura').classList.add('hidden');

    if (item.status === 'Em Andamento') {
        btnIniciar.classList.add('hidden');
        btnEnviar.classList.remove('hidden');
    } else {
        btnIniciar.classList.remove('hidden');
        btnEnviar.classList.add('hidden');
    }

    const modal = document.getElementById('tarefa-costura-modal');
    modal.classList.remove('hidden');
    setTimeout(() => document.getElementById('tarefa-costura-content').classList.remove('scale-95', 'opacity-0'), 10);
}

function iniciarCronometroETrabalho() {
    if (!tarefaCosturaAtiva) return;

    const item = costura.find(c => c.lote === tarefaCosturaAtiva.lote);
    if (item) {
        // Apenas atualiza o status se ainda não estiver "Em Andamento"
        if (item.status !== 'Em Andamento') {
            item.status = 'Em Andamento';
            item.usuarioInicio = currentUser.username;
            item.inicioTimestamp = new Date().toISOString();
            
            // *** NOVO LOG DETALHADO ADICIONADO AQUI ***
            logAction({
                acao: 'Início de tarefa de costura',
                modulo: 'Costura',
                funcao: 'iniciarCronometroETrabalho',
                detalhes: { 
                    lote: item.lote, 
                    sku: item.sku, 
                    pedidoId: item.pedidoId 
                }
            });

            saveData();
        }
    }

    // Esconde o botão "Iniciar" e mostra o botão "Enviar para Expedição"
    document.getElementById('btn-iniciar-trabalho').classList.add('hidden');
    document.getElementById('btn-enviar-expedicao').classList.remove('hidden');

    // Atualiza a tela de costura para refletir o novo status do card
    loadCostura();
}


// A função finalizarTarefaCostura foi removida.

function pausarEFecharModalCostura() {
    if (tarefaCosturaAtiva) {
        tarefaCosturaAtiva = null; 
    }
    const modal = document.getElementById('tarefa-costura-modal');
    modal.classList.add('hidden');
    showToast('Modal de costura fechado.', 'info');
}

function enviarParaExpedicao() {
    if (!hasPermission('expedicao', 'adicionar')) {
        return showToast('Permissão negada para mover itens para a expedição.', 'error');
    }

    if (!tarefaCosturaAtiva) return;

    const itemIndex = costura.findIndex(c => c.lote === tarefaCosturaAtiva.lote);
    if (itemIndex === -1) return showToast('Erro: Lote de costura não encontrado.', 'error');

    // Remove o item da costura
    const [itemMovido] = costura.splice(itemIndex, 1);

    // Define o usuário que finalizou a tarefa
    itemMovido.usuarioFim = currentUser.username;

    // Define o status na expedição (com lógica para Shopee)
    let statusFinalExpedicao = 'Pronto para Envio';
    if (itemMovido.marketplace === 'Shopee') {
        statusFinalExpedicao = 'Pronto para Envio (Shopee)';
    }

    // Adiciona o item à expedição
    expedicao.push({
        id: `EXP-${Date.now()}`,
        lote: itemMovido.lote,
        op: itemMovido.op,
        sku: itemMovido.sku,
        status: statusFinalExpedicao,
        pedidoId: itemMovido.pedidoId,
        marketplace: itemMovido.marketplace,
        tipoEntrega: itemMovido.tipoEntrega,
        dataExpedicao: new Date().toISOString(),
        usuarioInicioCostura: itemMovido.usuarioInicio,
        usuarioFimCostura: itemMovido.usuarioFim,
    });

    const loteFinalizado = tarefaCosturaAtiva.lote;
    tarefaCosturaAtiva = null; // Limpa a tarefa ativa
    
    // *** NOVO LOG DETALHADO ADICIONADO AQUI ***
    logAction({
        acao: 'Item finalizado e enviado para Expedição',
        modulo: 'Costura',
        funcao: 'enviarParaExpedicao',
        detalhes: { 
            lote: itemMovido.lote, 
            sku: itemMovido.sku, 
            pedidoId: itemMovido.pedidoId,
            finalizado_por: itemMovido.usuarioFim
        }
    });

    saveData();

    // Fecha o modal e atualiza as telas
    document.getElementById('tarefa-costura-modal').classList.add('hidden');
    loadCostura();
    loadExpedicao();

    showToast(`Lote ${loteFinalizado} enviado para a expedição!`, 'success');
}







// script.js

/**
 * Move um item finalizado da costura para a expedição.
 * NOVA LÓGICA: Verifica se o item é da Shopee e, em caso afirmativo,
 * o marca com um status especial para pular a conferência manual.
 */
function enviarParaExpedicao() {
    if (!hasPermission('expedicao', 'adicionar')) { // Permissão para adicionar na expedição
        return showToast('Permissão negada para mover itens para a expedição.', 'error');
    }

    if (!tarefaCosturaAtiva) return;

    const itemIndex = costura.findIndex(c => c.lote === tarefaCosturaAtiva.lote);
    if (itemIndex === -1) return showToast('Erro: Lote de costura não encontrado.', 'error');

    const [itemMovido] = costura.splice(itemIndex, 1);

    // *** INÍCIO DA LÓGICA DE AUTOMAÇÃO DA SHOPEE ***
    let statusFinalExpedicao = 'Pronto para Envio'; // Status padrão para ML, VC, etc.

    // Se o item for da Shopee, ele já vai "checkado".
    if (itemMovido.marketplace === 'Shopee') {
        statusFinalExpedicao = 'Pronto para Envio (Shopee)'; // Novo status especial
        logAction(`Item Shopee ${itemMovido.sku} movido para expedição (check automático).`);
    }
    // *** FIM DA LÓGICA DE AUTOMAÇÃO ***

    // Adiciona o item à expedição com o status correto.
    expedicao.push({
        id: `EXP-${Date.now()}`,
        lote: itemMovido.lote,
        op: itemMovido.op,
        sku: itemMovido.sku,
        status: statusFinalExpedicao, // Usa o status definido acima
        pedidoId: itemMovido.pedidoId,
        marketplace: itemMovido.marketplace,
        tipoEntrega: itemMovido.tipoEntrega,
        dataExpedicao: new Date().toISOString(),
        tempoCostura: itemMovido.tempoCostura
    });

    const loteFinalizado = tarefaCosturaAtiva.lote;
    tarefaCosturaAtiva = null;
    saveData();

    // Fecha o modal e atualiza as telas
    document.getElementById('tarefa-costura-modal').classList.add('hidden');
    loadCostura();
    loadExpedicao(); // Garante que a expedição seja atualizada

    showToast(`Lote ${loteFinalizado} enviado para a expedição!`, 'success');
}



/**
 * Confirma e move todos os itens de costura selecionados para a expedição.
 */
/**
 * Confirma e move todos os itens de costura selecionados para a expedição.
 */
function confirmarConclusaoCostura() {
    // Verifica se o usuário tem permissão para adicionar itens à expedição.
    if (!hasPermission('expedicao', 'adicionar')) {
        showToast('Permissão negada para enviar para a expedição.', 'error');
        return;
    }

    // Pega todos os itens marcados com o checkbox na tela de Costura.
    const selecionados = document.querySelectorAll('.costura-checkbox:checked');
    if (selecionados.length === 0) {
        showToast('Nenhum item selecionado.', 'info');
        return;
    }

    // Pede uma confirmação final ao usuário antes de mover os itens.
    if (confirm(`Tem certeza que deseja mover os ${selecionados.length} itens selecionados para a Expedição?`)) {
        let itensMovidos = 0;
        selecionados.forEach(checkbox => {
            const lote = checkbox.dataset.lote;
            // Encontra o item na lista de 'costura' pelo seu lote.
            const itemIndex = costura.findIndex(item => item.lote === lote);

            if (itemIndex !== -1) {
                // Remove o item da lista de 'costura'.
                const [itemMovido] = costura.splice(itemIndex, 1);
                
                // *** CORREÇÃO PRINCIPAL APLICADA AQUI ***
                // Adiciona o item movido à lista de 'expedicao' com todas as informações necessárias.
        expedicao.push({
            id: `EXP-${Date.now()}`,
            lote: itemMovido.lote,
            op: itemMovido.op,
            sku: itemMovido.sku,
            status: 'Pronto para Envio',
            pedidoId: itemMovido.pedidoId,
            dataExpedicao: new Date().toISOString(),
            skuEtiqueta: itemMovido.sku, // Adiciona SKU para a etiqueta
            nfEtiqueta: itemMovido.nf // Adiciona NF para a etiqueta (se disponível no itemMovido)
        });
                itensMovidos++;
            }
        });

        // Se algum item foi movido com sucesso, salva os dados e atualiza a tela.
        if (itensMovidos > 0) {
            saveData();
            loadCostura(); // Recarrega a tela de costura, que agora terá menos itens.
            logAction(`${itensMovidos} item(ns) movidos da Costura para a Expedição.`);
            showToast(`${itensMovidos} item(ns) enviados para a Expedição.`, 'success');
        }
    }
}


/**
 * Move um item da costura para a expedição.
 * @param {string} lote - O lote do item na costura.
 */
function moverCosturaParaExpedicao(lote) {
    if (!hasPermission('expedicao', 'adicionar')) {
        showToast('Permissão negada para enviar para a expedição.', 'error');
        return;
    }

    const itemIndex = costura.findIndex(item => item.lote === lote);
    if (itemIndex === -1) {
        showToast('Item de costura não encontrado.', 'error');
        return;
    }

    const [itemMovido] = costura.splice(itemIndex, 1);
    
    // Adiciona o item à fila da expedição
            expedicao.push({
                id: `EXP-${Date.now()}`,
                lote: `LOTE-${Date.now()}`,
                op: pedido.op,
                sku: pedido.sku,
                status: 'Pronto para Envio',
                pedidoId: pedido.id,
                dataExpedicao: new Date().toISOString(),
                // Adicionar informações de SKU e NF para a etiqueta
                skuEtiqueta: pedido.sku, // SKU para a etiqueta
                nfEtiqueta: pedido.nf // NF para a etiqueta
            });

    saveData();
    loadCostura(); // Recarrega a tela de costura
    logAction(`Item ${itemMovido.sku} (Lote: ${sku}) movido da Costura para a Expedição.`);
    showToast(`Item ${sku} enviado para a Expedição.`, 'success');
}

/**
 * Cancela um item que está na fila de costura.
 * O item volta para a fila de produção.
 * @param {string} lote - O lote do item na costura.
 */
function cancelarCostura(lote) {
    if (!hasPermission('costura', 'excluir')) {
        showToast('Permissão negada para cancelar costura.', 'error');
        return;
    }

    const itemIndex = costura.findIndex(item => item.lote === lote);
    if (itemIndex === -1) {
        showToast('Item de costura não encontrado.', 'error');
        return;
    }

    if (confirm('Tem certeza que deseja cancelar a costura deste item? Ele voltará para a fila de produção.')) {
        const [itemCancelado] = costura.splice(itemIndex, 1);

        // Volta o item para a produção
        producao.push({
            op: itemCancelado.op,
            sku: itemCancelado.sku,
            status: 'Aguardando Produção',
            pedidoId: itemCancelado.pedidoId,
            dataColeta: new Date().toLocaleDateString('pt-BR'),
            tipoEntrega: 'Coleta'
        });

        saveData();
        loadCostura(); // Recarrega a tela de costura
        logAction(`Costura do item ${itemCancelado.sku} (Lote: ${lote}) cancelada.`);
        showToast(`Costura de ${itemCancelado.sku} cancelada.`, 'info');
    }
}






// =================================================================================
// LÓGICA DO MODAL DE ATRIBUIÇÃO DE GRUPOS (PARA ADMINS)
// =================================================================================

function abrirModalAtribuirGrupos() {
    const modal = document.getElementById('atribuir-grupos-modal');
    const modalContent = document.getElementById('atribuir-grupos-content');
    const userSelect = document.getElementById('atribuir-usuario-select');
    const checkboxesContainer = document.getElementById('grupos-costura-checkboxes');
    
    userSelect.innerHTML = '<option value="">Selecione um usuário...</option>';
    
    // Define quais usuários o admin logado pode gerenciar
    let usuariosGerenciaveis = [];
    if (currentUser.role === 'admin-master') {
        usuariosGerenciaveis = users.filter(u => u.role === 'user');
    } else if (currentUser.role === 'admin-setor') {
        usuariosGerenciaveis = users.filter(u => u.role === 'user' && (u.setor === currentUser.setor || !u.setor));
    }

    usuariosGerenciaveis.forEach(user => {
        userSelect.innerHTML += `<option value="${user.username}">${user.username}</option>`;
    });

    const ordemGrupos = ['CL', 'FF', 'KC', 'KD', 'PC', 'PH', 'PR', 'PV', 'PV-ESPECIAL', 'RV', 'TP', 'VC', 'PA', 'OUTROS'];
    checkboxesContainer.innerHTML = ordemGrupos.map(grupo => `
        <label class="flex items-center space-x-2 cursor-pointer p-2 rounded-md hover:bg-gray-100">
            <input type="checkbox" value="${grupo}" class="h-5 w-5 rounded text-indigo-600 focus:ring-indigo-500">
            <span class="font-medium text-gray-700">${grupo}</span>
        </label>
    `).join('');

    userSelect.onchange = () => {
        const username = userSelect.value;
        const user = users.find(u => u.username === username);
        document.querySelectorAll('#grupos-costura-checkboxes input').forEach(chk => {
            chk.checked = user?.gruposCostura?.includes(chk.value) || false;
        });
    };
    userSelect.dispatchEvent(new Event('change'));

    modal.classList.remove('hidden');
    setTimeout(() => modalContent.classList.remove('scale-95', 'opacity-0'), 10);
}

function fecharModalAtribuirGrupos() {
    document.getElementById('atribuir-grupos-modal').classList.add('hidden');
}

function salvarAtribuicaoGrupos() {
    const username = document.getElementById('atribuir-usuario-select').value;
    if (!username) {
        showToast('Por favor, selecione um usuário.', 'error');
        return;
    }

    const user = users.find(u => u.username === username);
    if (!user) {
        showToast('Usuário não encontrado.', 'error');
        return;
    }
    
    // Garante que a propriedade exista antes de atribuir
    if (!user.gruposCostura) {
        user.gruposCostura = [];
    }

    const gruposSelecionados = Array.from(document.querySelectorAll('#grupos-costura-checkboxes input:checked')).map(chk => chk.value);
    user.gruposCostura = gruposSelecionados;
    
    // Se o admin logado é um admin de setor, ele automaticamente atribui o usuário ao seu setor
    if (currentUser.role === 'admin-setor') {
        user.setor = currentUser.setor;
    }

    saveData();
    showToast(`Grupos de costura para ${username} salvos com sucesso!`, 'success');
    logAction(`Grupos de costura para ${username} atualizados: [${gruposSelecionados.join(', ')}]`);
    fecharModalAtribuirGrupos();
}















// =================================================================================
// MÓDULO DE EXPEDIÇÃO (COM MODAL DE IMPRESSÃO E BAIXA AUTOMÁTICA)
// =================================================================================

/**
 * Função principal que carrega e renderiza a tela de Expedição.
 * Organiza os pacotes em abas por marketplace e em uma seção para itens incompletos.
 */
function loadExpedicao() {
    if (!hasPermission('expedicao', 'visualizar')) return;

    // Contêineres para as abas
    const mlContainer = document.getElementById('expedicao-ml-content');
    const shopeeContainer = document.getElementById('expedicao-shopee-content');
    const vcContainer = document.getElementById('expedicao-vc-content');
    const aguardandoContainer = document.getElementById('expedicao-incompletos-container');

    // Contadores das abas
    const contadorML = document.getElementById('contador-expedicao-ml');
    const contadorShopee = document.getElementById('contador-expedicao-shopee');
    const contadorVC = document.getElementById('contador-expedicao-vc');

    if (!mlContainer || !shopeeContainer || !vcContainer || !aguardandoContainer) return;

    // Limpa todos os contêineres
    mlContainer.innerHTML = '';
    shopeeContainer.innerHTML = '';
    vcContainer.innerHTML = '';
    aguardandoContainer.innerHTML = '';

    const { pacotesCompletos, pacotesIncompletos } = getStatusTodosPacotes();

    // Separa os pacotes completos por marketplace
    const pacotesML = pacotesCompletos.filter(p => p.marketplace === 'Mercado Livre');
    const pacotesShopee = pacotesCompletos.filter(p => p.marketplace === 'Shopee');
    const pacotesVC = pacotesCompletos.filter(p => p.marketplace !== 'Mercado Livre' && p.marketplace !== 'Shopee');

    // Atualiza os contadores
    contadorML.innerText = pacotesML.length;
    contadorShopee.innerText = pacotesShopee.length;
    contadorVC.innerText = pacotesVC.length;

    // Função auxiliar para renderizar os grupos de pacotes em cada aba
    const renderizarPacotesNaAba = (pacotes, container) => {
        if (pacotes.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500 py-8">Nenhum pacote completo aguardando montagem aqui.</p>`;
            return;
        }
        const pacotesPorGrupo = agruparPacotesPorGrupo(pacotes);
        renderizarGruposDePacotes(pacotesPorGrupo, container, renderCardPacotePronto);
    };

    // Renderiza os pacotes em suas respectivas abas
    renderizarPacotesNaAba(pacotesML, mlContainer);
    renderizarPacotesNaAba(pacotesShopee, shopeeContainer);
    renderizarPacotesNaAba(pacotesVC, vcContainer);

    // Renderiza a seção de pacotes incompletos (lógica inalterada)
    if (pacotesIncompletos.length === 0) {
        aguardandoContainer.innerHTML = `<p class="text-center text-gray-500 py-8">Nenhum pacote aguardando itens.</p>`;
    } else {
        const incompletosPorGrupo = agruparPacotesPorGrupo(pacotesIncompletos);
        renderizarGruposDePacotes(incompletosPorGrupo, aguardandoContainer, renderCardPacoteIncompleto);
    }
    
    applyPermissionsToUI();
}
/**
 * Analisa e separa os pacotes da expedição em "completos" e "incompletos".
 * VERSÃO 4.0 - CORREÇÃO CRÍTICA NA CONTAGEM DE ITENS NECESSÁRIOS.
 *
 * @returns {object} Um objeto com { pacotesCompletos, pacotesIncompletos }.
 */
function getStatusTodosPacotes() {
    const itensNaExpedicao = expedicao.filter(item => item.status !== 'Enviado');

    // 1. Mapeia o que é NECESSÁRIO para cada pedido.
    // *** A CORREÇÃO ESTÁ AQUI ***
    const skusNecessariosPorPedido = pedidos.reduce((acc, p) => {
        // Ignora pedidos que não estão no fluxo (ex: cancelados)
        if (p.status === 'Cancelado') {
            return acc;
        }
        
        if (!acc[p.id]) {
            acc[p.id] = {
                id: p.id,
                marketplace: p.marketplace,
                cliente: p.cliente,
                tipoEntrega: p.tipoEntrega,
                skus: {} // Objeto para contar a quantidade de cada SKU
            };
        }
        
        // SOMA a quantidade do pedido original, em vez de apenas contar +1.
        // Isso resolve o problema de múltiplas unidades (x2, x3, etc.).
        acc[p.id].skus[p.sku] = (acc[p.id].skus[p.sku] || 0) + p.quantidade;
        return acc;
    }, {});

    // 2. Mapeia o que está PRESENTE na expedição.
    // Agrupa os itens que já chegaram por ID de pedido.
    const itensPresentesPorPedido = itensNaExpedicao.reduce((acc, item) => {
        if (!acc[item.pedidoId]) {
            acc[item.pedidoId] = [];
        }
        acc[item.pedidoId].push(item);
        return acc;
    }, {});

    const pacotesCompletos = [];
    const pacotesIncompletos = [];

    // 3. Compara o NECESSÁRIO com o PRESENTE para cada pedido na expedição.
    Object.keys(itensPresentesPorPedido).forEach(pedidoId => {
        const itensPresentes = itensPresentesPorPedido[pedidoId];
        const infoPedidoOriginal = skusNecessariosPorPedido[pedidoId];

        // Se não houver um pedido original correspondente (ex: pedido 100% manual),
        // consideramos o pacote como completo por padrão.
        if (!infoPedidoOriginal) {
            pacotesCompletos.push({
                id: pedidoId,
                marketplace: itensPresentes[0].marketplace || 'Manual',
                tipoEntrega: itensPresentes[0].tipoEntrega,
                itensPresentes: itensPresentes,
                isCompleto: true
            });
            return; // Pula para o próximo.
        }

        // Conta quantos de cada SKU estão fisicamente na expedição.
        const contagemPresentes = itensPresentes.reduce((acc, item) => {
            acc[item.sku] = (acc[item.sku] || 0) + 1; // Soma +1 para cada item físico
            return acc;
        }, {});

        let isCompleto = true;
        const skusFaltantes = [];

        // Verifica se cada SKU necessário está presente na quantidade correta.
        for (const sku in infoPedidoOriginal.skus) {
            const necessario = infoPedidoOriginal.skus[sku];
            const presente = contagemPresentes[sku] || 0;
            
            if (presente < necessario) {
                isCompleto = false;
                skusFaltantes.push({ sku: sku, falta: necessario - presente });
            }
        }

        const pacote = {
            ...infoPedidoOriginal,
            itensPresentes,
            isCompleto,
            skusFaltantes
        };

        if (isCompleto) {
            pacotesCompletos.push(pacote);
        } else {
            pacotesIncompletos.push(pacote);
        }
    });

    return { pacotesCompletos, pacotesIncompletos };
}







/**
 * Agrupa uma lista de pacotes pelo grupo de SKU do primeiro item.
 */
function agruparPacotesPorGrupo(pacotes) {
    return pacotes.reduce((acc, pacote) => {
        const grupo = getGrupoSku(pacote.itensPresentes[0].sku);
        if (!acc[grupo]) acc[grupo] = [];
        acc[grupo].push(pacote);
        return acc;
    }, {});
}

/**
 * Renderiza os grupos de pacotes em um container HTML, garantindo a ordem e o layout.
 * @param {object} grupos - Objeto com pacotes agrupados por grupo de SKU.
 * @param {HTMLElement} container - O elemento HTML onde os grupos serão renderizados.
 * @param {function} cardRenderer - A função que renderiza o card de cada pacote.
 */
function renderizarGruposDePacotes(grupos, container, cardRenderer) {
    container.innerHTML = ''; // Limpa o container
    const ordemGrupos = ['CL', 'FF', 'KC', 'KD', 'PC', 'PH', 'PR', 'PV', 'PV-ESPECIAL', 'RV', 'TP', 'VC', 'PA','OUTROS'];
    
    ordemGrupos.forEach(grupo => {
        if (grupos[grupo]) {
            // **MELHORIA**: Ordena os pacotes alfabeticamente pelo ID do pedido dentro de cada grupo.
            grupos[grupo].sort((a, b) => a.id.localeCompare(b.id));

            const grupoHtml = `
                <div class="mb-10">
                    <h4 class="text-xl font-bold text-gray-700 mb-4 border-b pb-2">Grupo: ${grupo}</h4>
                    <!-- MELHORIA: Garante 4 colunas em telas grandes (xl) -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
                        ${grupos[grupo].map(cardRenderer).join('')}
                    </div>
                </div>
            `;
            container.innerHTML += grupoHtml;
        }
    });
}


/**
 * Renderiza o card de um pacote completo na expedição.
 * VERSÃO FINAL: Pacotes da Shopee são visualmente destacados, mas permanecem clicáveis.
 * @param {object} pacote - O objeto do pacote a ser renderizado.
 * @returns {string} O HTML do card.
 */
function renderCardPacotePronto(pacote) {
    const { id, itensPresentes, tipoEntrega, marketplace } = pacote;

    const skusContados = itensPresentes.reduce((acc, item) => {
        acc[item.sku] = (acc[item.sku] || 0) + 1;
        return acc;
    }, {});

    const skuPrincipal = Object.keys(skusContados).reduce((a, b) => skusContados[a] > skusContados[b] ? a : b);
    const quantidadeTotalItens = itensPresentes.length;

    const imageMap = images.reduce((acc, img) => ({ ...acc, [img.nome.toUpperCase()]: img.url }), {});
    const imageUrl = imageMap[skuPrincipal.toUpperCase()] || CAMINHO_IMAGEM_TESTE;

    const isShopeeAutoChecked = marketplace === 'Shopee';

    // *** LÓGICA DE CORREÇÃO APLICADA AQUI ***
    // A ação de clique e o cursor de ponteiro são aplicados a TODOS os cards.
    const onClickAction = `onclick="abrirModalConferencia('${id}')"`;
    const cardCursor = 'cursor-pointer';
    
    const shopeeIndicator = isShopeeAutoChecked
        ? `<div class="absolute top-3 left-3 bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-2 z-20">
             <i class="fas fa-check-double"></i> PRONTO (SHOPEE)
           </div>`
        : '';   

    const isMotoboy = tipoEntrega === 'Motoboy';
    const motoboyIndicator = isMotoboy
        ? `<span class="absolute top-3 right-3 bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 animate-pulse z-20"><i class="fas fa-motorcycle"></i> MOTOBOY</span>`
        : '';

    return `
        <div ${onClickAction}
             class="pacote-card ${cardCursor} relative rounded-2xl shadow-lg overflow-hidden group transition-transform transform hover:scale-105"
             style="height: 350px;">

            <div class="absolute inset-0 bg-no-repeat bg-cover bg-center transition-transform duration-300 group-hover:scale-110"
                 style="background-image: url('${imageUrl}');"></div>

            <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent"></div>

            ${shopeeIndicator}
            ${motoboyIndicator}

            <div class="relative p-4 flex flex-col justify-end h-full text-white z-10">
                <div>
                    <span class="text-sm bg-green-500 text-white font-bold py-1 px-3 rounded-full self-start mb-2 inline-block">
                        ${quantidadeTotalItens} ${quantidadeTotalItens > 1 ? 'Itens' : 'Item'}
                    </span>
                    <p class="font-bold text-2xl tracking-tight leading-tight">${skuPrincipal}</p>
                    <p class="text-sm opacity-80">${id}</p>
                </div>
            </div>
        </div>
    `;
}

    


/**
 * Renderiza o card de um pacote incompleto, mostrando exatamente o que falta.
 * VERSÃO 2.0
 */
function renderCardPacoteIncompleto(pacote) {
    const { id, cliente, skusFaltantes } = pacote;

    // Gera a lista de itens que ainda não chegaram na expedição.
    const listaFaltantesHtml = skusFaltantes.map(item =>
        `<li><span class="font-bold text-red-700">${item.falta}x</span> ${item.sku}</li>`
    ).join('');

    return `
        <div class="bg-white p-5 rounded-xl shadow-md border-l-4 border-yellow-400">
            <h4 class="font-bold text-lg text-yellow-800">${id}</h4>
            <p class="text-sm text-gray-600">${cliente || 'Cliente não informado'}</p>
            <div class="mt-3 pt-3 border-t">
                <p class="text-sm font-bold text-gray-700">Aguardando Itens:</p>
                <ul class="list-disc list-inside text-sm text-red-600">${listaFaltantesHtml}</ul>
            </div>
        </div>
    `;
}


/**
 * NOVA FUNÇÃO: Controla a visibilidade das abas no módulo de Expedição.
 * @param {'ml' | 'shopee' | 'vc'} tabName - O nome da aba a ser exibida.
 */
function showExpedicaoTab(tabName) {
    // Oculta o conteúdo de todas as abas de expedição
    document.querySelectorAll('.expedicao-tab-content').forEach(content => {
        content.classList.add('hidden');
    });

    // Remove o estilo "ativo" de todos os botões de aba de expedição
    document.querySelectorAll('.expedicao-tab-btn').forEach(btn => {
        btn.classList.remove('border-blue-600', 'text-blue-600');
        btn.classList.add('border-transparent', 'text-gray-500', 'hover:text-gray-700');
    });

    // Mostra o conteúdo da aba selecionada
    const contentToShow = document.getElementById(`expedicao-${tabName}-content`);
    if (contentToShow) {
        contentToShow.classList.remove('hidden');
    }

    // Aplica o estilo "ativo" ao botão da aba clicada
    const btnToActivate = document.getElementById(`tab-expedicao-${tabName}`);
    if (btnToActivate) {
        btnToActivate.classList.add('border-blue-600', 'text-blue-600');
        btnToActivate.classList.remove('border-transparent', 'text-gray-500');
    }
}

/**
 * Abre o modal de conferência com todas as informações do pacote e botões de ação.
 */
function abrirModalConferencia(pedidoId) {
    const modal = document.getElementById('conferencia-modal');
    const infoContainer = document.getElementById('conferencia-pedido-info');
    const listaItensContainer = document.getElementById('conferencia-lista-itens');
    const modalFooter = document.getElementById('conferencia-modal-footer');

    const { pacotesCompletos } = getStatusTodosPacotes();
    const pacote = pacotesCompletos.find(p => p.id === pedidoId);

    if (!pacote) {
        showToast(`Pacote ${pedidoId} não está completo ou não foi encontrado.`, 'error');
        return;
    }

    // Pega o primeiro item do pacote para obter dados da etiqueta (rastreio, nf, zpl)
    const primeiroItem = pacote.itensPresentes[0];
    const rastreio = primeiroItem.codigoRastreio || 'Não associado';
    const nf = primeiroItem.nfEtiqueta || 'Não associada';

    // Monta o HTML com todas as informações
    infoContainer.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div class="bg-white p-3 rounded-lg border"><strong>Pedido ID:</strong> ${pacote.id}</div>
            <div class="bg-white p-3 rounded-lg border"><strong>Marketplace:</strong> ${pacote.marketplace || 'N/A'}</div>
            <div class="bg-white p-3 rounded-lg border"><strong>Cliente:</strong> ${pacote.cliente || 'N/A'}</div>
            <div class="bg-white p-3 rounded-lg border"><strong>Tipo de Entrega:</strong> ${pacote.tipoEntrega || 'N/A'}</div>
            <div class="bg-white p-3 rounded-lg border col-span-1 md:col-span-2"><strong>Cód. Rastreio:</strong> <span class="font-mono font-bold text-blue-600">${rastreio}</span></div>
            <div class="bg-white p-3 rounded-lg border col-span-1 md:col-span-2"><strong>Nota Fiscal:</strong> <span class="font-mono font-bold text-purple-600">${nf}</span></div>
        </div>
    `;

    const skusContados = pacote.itensPresentes.reduce((acc, item) => ({ ...acc, [item.sku]: (acc[item.sku] || 0) + 1 }), {});
    listaItensContainer.innerHTML = Object.entries(skusContados).map(([sku, qtd]) => `
        <div class="flex items-center justify-between bg-white p-3 rounded-lg border">
            <span class="font-bold text-lg text-indigo-700">${sku}</span>
            <span class="text-2xl font-extrabold text-gray-800">${qtd}x</span>
        </div>`).join('');

    // Define os botões de ação no rodapé
    modalFooter.innerHTML = `
        <button id="btn-imprimir-dar-baixa" onclick="imprimirEtiquetaEDarBaixa('${pacote.id}')" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-lg shadow-lg flex items-center justify-center gap-2">
            <i class="fas fa-print"></i> Imprimir Etiqueta e Dar Baixa
        </button>
        <button onclick="fecharModalConferencia()" class="w-full bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 rounded-xl text-lg shadow-lg">
            Fechar
        </button>
    `;

    modal.classList.remove('hidden');
    document.getElementById('conferencia-modal-content').classList.remove('scale-95', 'opacity-0');
}

function fecharModalConferencia() {
    const modal = document.getElementById('conferencia-modal');
    modal.classList.add('hidden');
    document.getElementById('conferencia-modal-content').classList.add('scale-95', 'opacity-0');
}

/**
 * Função ÚNICA: Imprime a etiqueta (PDF ou ZPL) e, em seguida, dá baixa no pacote.
 */
function imprimirEtiquetaEDarBaixa(pedidoId) {
    const itemExpedicao = expedicao.find(item => item.pedidoId === pedidoId);

    if (!itemExpedicao) {
        showToast('Erro: Pacote não encontrado na expedição.', 'error');
        return;
    }

    // *** NOVA LÓGICA DE IMPRESSÃO ***
    // 1. Prioriza a etiqueta em PDF
    if (itemExpedicao.pdfEtiqueta) {
        const link = document.createElement('a');
        link.href = itemExpedicao.pdfEtiqueta;
        link.download = `etiqueta_shopee_${pedidoId.replace('#', '')}.pdf`;
        link.target = '_blank'; // Abre em nova aba para visualização/impressão
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast(`Etiqueta PDF para o pedido ${pedidoId} aberta para impressão.`, 'success');
    
    // 2. Se não houver PDF, tenta usar o ZPL (para compatibilidade com ML)
    } else if (itemExpedicao.zplContent) {
        const blob = new Blob([itemExpedicao.zplContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `etiqueta_ml_${pedidoId.replace('#', '')}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast(`Etiqueta ZPL para o pedido ${pedidoId} gerada.`, 'success');
    
    // 3. Se não houver nenhuma etiqueta
    } else {
        showToast('Nenhuma etiqueta (PDF ou ZPL) encontrada para este pedido. Associe a etiqueta primeiro.', 'error');
        return; // Interrompe a função se não houver etiqueta para imprimir
    }

    // O restante da lógica de dar baixa permanece o mesmo
    let itensEnviadosCount = 0;
    expedicao.forEach(item => {
        if (item.pedidoId === pedidoId && item.status !== 'Enviado') {
            item.status = 'Enviado';
            item.dataEnvio = new Date().toISOString();
            item.usuarioEnvio = currentUser.username;
            itensEnviadosCount++;
        }
    });

    if (itensEnviadosCount > 0) {
        saveData();
        logAction({
            acao: 'Pacote enviado (baixa automática pós-impressão)',
            modulo: 'Expedição',
            funcao: 'imprimirEtiquetaEDarBaixa',
            detalhes: { pedidoId: pedidoId, quantidade_itens: itensEnviadosCount, rastreio: itemExpedicao.codigoRastreio }
        });
        showToast(`Baixa automática do pacote ${pedidoId} realizada!`, 'success');
        
        loadExpedicao();
        
        const btn = document.getElementById('btn-imprimir-dar-baixa');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-check-circle"></i> Baixa Realizada`;
            btn.classList.replace('bg-blue-600', 'bg-green-600');
        }
    }
}


// =================================================================================
// FUNÇÕES PARA PROCESSAMENTO DE ETIQUETAS ZPL (COM ARMAZENAMENTO DO ZPL)
// =================================================================================

function triggerZplUpload() {
    if (!hasPermission('expedicao', 'editar')) {
        showToast('Permissão negada para associar etiquetas.', 'error');
        return;
    }
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.zpl, .txt';
    fileInput.multiple = true;
    fileInput.onchange = (event) => {
        const files = event.target.files;
        if (files.length > 0) processZplFiles(files);
    };
    fileInput.click();
}

async function processZplFiles(files) {
    showToast(`Lendo ${files.length} arquivo(s) de etiqueta...`, 'info');
    let totalEtiquetasAssociadas = 0;
    let erros = [];

    for (const file of files) {
        try {
            const zplContentCompleto = await file.text();
            const etiquetasIndividuais = zplContentCompleto.split('^XA');

            if (etiquetasIndividuais.length <= 1) {
                erros.push(`Nenhuma etiqueta ZPL válida encontrada no arquivo: ${file.name}`);
                continue;
            }

            etiquetasIndividuais.forEach(etiquetaZpl => {
                if (etiquetaZpl.trim() === '') return;

                const etiquetaCompleta = '^XA' + etiquetaZpl;
                const idVenda = parseZplForSaleId(etiquetaCompleta);
                const codigoRastreio = extrairCodigoRastreio(etiquetaCompleta);

                if (!idVenda || !codigoRastreio) {
                    console.warn(`ID ou Rastreio não extraído de uma etiqueta em ${file.name}`);
                    return;
                }

                let encontrouItem = false;
                expedicao.forEach(item => {
                    if (item.pedidoId && item.pedidoId.includes(idVenda) && item.status !== 'Enviado') {
                        item.codigoRastreio = codigoRastreio;
                        item.nfEtiqueta = extrairNfDaEtiqueta(etiquetaCompleta) || item.nfEtiqueta;
                        item.zplContent = etiquetaCompleta; // Armazena o ZPL
                        encontrouItem = true;
                    }
                });

                if (encontrouItem) {
                    totalEtiquetasAssociadas++;
logAction({
    acao: 'Etiqueta ZPL (ML) associada',
    modulo: 'Expedição',
    funcao: 'processZplFiles',
    detalhes: { vendaId: idVenda, rastreio: codigoRastreio, arquivo: file.name }
});
                } else {
                    erros.push(`Nenhum pedido na expedição para o ID ${idVenda} (arquivo ${file.name}).`);
                }
            });

        } catch (error) {
            erros.push(`Falha ao ler o arquivo: ${file.name}`);
        }
    }

    if (totalEtiquetasAssociadas > 0) {
        saveData();
        loadExpedicao();
        showToast(`${totalEtiquetasAssociadas} etiqueta(s) associada(s) com sucesso!`, 'success');
    }

    if (erros.length > 0) {
        setTimeout(() => alert(`Ocorreram ${erros.length} erros/avisos:\n\n- ${erros.join('\n- ')}`), 500);
    }
}

function parseZplForSaleId(zplContent) {
    const regexVendaDividida = /\^FD(Venda:|Pack ID:)\s*(\d+)\^FS(?:.|\n)*?\^FO\d+,\d+\^A0N,\d+,\d+\^FD(\d{11,})\^FS/;
    const match = zplContent.match(regexVendaDividida);
    if (match && match[2] && match[3]) return match[2] + match[3];

    const regexIdUnico = /\^FO\d+,\d+\^A0N,\d+,\d+\^FD(\d{11,})\^FS/;
    const matchIdUnico = zplContent.match(regexIdUnico);
    if (matchIdUnico && matchIdUnico[1]) return matchIdUnico[1];
    
    return null;
}

function extrairCodigoRastreio(zplContent) {
    const rastreioMatch = zplContent.match(/\^BCN.*?\^FD>:(.*?)\^FS/);
    if (rastreioMatch && rastreioMatch[1]) return rastreioMatch[1];
    
    const qrMatch = zplContent.match(/\^FDLA,{"id":"(.*?)"/);
    if (qrMatch && qrMatch[1]) return qrMatch[1];

    return null;
}

function extrairNfDaEtiqueta(zplContent) {
    const nfMatch = zplContent.match(/NF:\s*(\d+)/);
    return nfMatch ? nfMatch[1] : null;
}



// script.js

/**
 * Processa arquivos de etiqueta ZPL da Shopee, incluindo etiquetas comprimidas (Z64).
 * VERSÃO CORRIGIDA para lidar com quebras de linha em dados Base64.
 * @param {FileList} files - A lista de arquivos ZPL/TXT selecionados pelo usuário.
 */
// script.js

/**
 * Processa arquivos de etiqueta ZPL da Shopee, incluindo etiquetas comprimidas (Z64).
 * VERSÃO DEFINITIVA com extração via Regex para máxima precisão.
 * @param {FileList} files - A lista de arquivos ZPL/TXT selecionados pelo usuário.
 */
async function processarEtiquetasShopeeZPL(files) {
    if (!hasPermission('expedicao', 'editar')) {
        showToast('Permissão negada para associar etiquetas.', 'error');
        return;
    }

    showToast(`Iniciando associação de ${files.length} arquivo(s) de etiqueta da Shopee...`, 'info');

    let etiquetasAssociadas = 0;
    let errosEncontrados = [];

    for (const file of files) {
        try {
            const conteudoArquivo = await file.text();
            // A separação por ^XA continua sendo uma boa abordagem para múltiplas etiquetas.
            const etiquetasIndividuais = conteudoArquivo.split('^XA');

            for (let etiquetaZPL of etiquetasIndividuais) {
                if (etiquetaZPL.trim() === '') continue;

                let zplCompleto = '^XA' + etiquetaZPL;
                let zplLegivel = zplCompleto;

                if (zplCompleto.includes(':Z64:')) {
                    try {
                        // *** CORREÇÃO DEFINITIVA APLICADA AQUI ***
                        // 1. Usamos uma Regex para extrair APENAS o conteúdo Base64 entre :Z64: e ^FS.
                        const regex = /:Z64:([a-zA-Z0-9+/=\s\r\n]+)\^FS/;
                        const match = zplCompleto.match(regex);

                        // Se a regex não encontrar o padrão, pula para a próxima etiqueta.
                        if (!match || !match[1]) {
                            continue;
                        }

                        // 2. Pega o conteúdo capturado (match[1]) e remove quebras de linha e espaços.
                        const dadosComprimidosBase64Limpos = match[1].replace(/[\n\r\s]/g, '');

                        // 3. Decodifica e descomprime com segurança.
                        const dadosComprimidos = Uint8Aray.from(atob(dadosComprimidosBase64Limpos), c => c.charCodeAt(0));
                        const dadosDescomprimidos = pako.inflate(dadosComprimidos, { to: 'string' });
                        zplLegivel = dadosDescomprimidos;

                    } catch (e) {
                        console.error("Falha ao descomprimir etiqueta ZPL:", e);
                        errosEncontrados.push(`Erro ao decodificar uma etiqueta comprimida no arquivo ${file.name}. Verifique o console.`);
                        continue;
                    }
                }

                // O restante do código permanece o mesmo...
                const idPedidoShopee = extrairIdPedidoShopee(zplLegivel);
                const codigoRastreio = extrairCodigoRastreioShopee(zplLegivel);

                if (!idPedidoShopee || !codigoRastreio) {
                    if (zplLegivel.length > 50) {
                       errosEncontrados.push(`Não foi possível extrair ID ou rastreio de uma etiqueta no arquivo ${file.name}.`);
                    }
                    continue;
                }

                const itemExpedicao = expedicao.find(item =>
                    item.pedidoId && item.pedidoId.includes(idPedidoShopee) && item.status !== 'Enviado'
                );

                if (itemExpedicao) {
                    itemExpedicao.codigoRastreio = codigoRastreio;
                    itemExpedicao.zplContent = zplCompleto;
                    etiquetasAssociadas++;
logAction({
    acao: 'Etiqueta ZPL (Shopee) associada',
    modulo: 'Expedição',
    funcao: 'processarEtiquetasShopeeZPL',
    detalhes: { pedidoId: idPedidoShopee, rastreio: codigoRastreio, arquivo: file.name }
});
                } else {
                    errosEncontrados.push(`Nenhum pedido pendente na expedição encontrado para o ID Shopee: ${idPedidoShopee}.`);
                }
            }
        } catch (error) {
            errosEncontrados.push(`Falha ao ler o arquivo: ${file.name}.`);
            console.error("Erro ao processar arquivo ZPL da Shopee:", error);
        }
    }

    // Feedback final...
    if (etiquetasAssociadas > 0) {
        saveData();
        loadExpedicao();
        showToast(`${etiquetasAssociadas} etiqueta(s) da Shopee foram associadas com sucesso!`, 'success');
    } else {
        showToast('Nenhuma nova etiqueta da Shopee foi associada.', 'info');
    }

    if (errosEncontrados.length > 0) {
        setTimeout(() => alert(`Ocorreram ${errosEncontrados.length} erros/avisos durante a associação:\n\n- ${errosEncontrados.join('\n- ')}`), 500);
    }
}


// As funções 'extrairIdPedidoShopee' e 'extrairCodigoRastreioShopee' permanecem as mesmas,
// pois elas agora operarão no ZPL já descomprimido.


/**
 * Extrai o ID do Pedido de um bloco de ZPL da Shopee.
 * Ex: 240916S35GBM9J
 * @param {string} zplContent - O conteúdo da etiqueta ZPL.
 * @returns {string|null} O ID do pedido ou null se não for encontrado.
 */
function extrairIdPedidoShopee(zplContent) {
    // Procura por um padrão de texto que geralmente precede o ID do pedido.
    // Este regex busca por uma sequência alfanumérica (letras e números) com 14 caracteres.
    const match = zplContent.match(/\^FD([A-Z0-9]{14})\^FS/);
    return match ? match[1] : null;
}

/**
 * Extrai o Código de Rastreio de um bloco de ZPL da Shopee.
 * Ex: BR248910081735S
 * @param {string} zplContent - O conteúdo da etiqueta ZPL.
 * @returns {string|null} O código de rastreio ou null se não for encontrado.
 */
function extrairCodigoRastreioShopee(zplContent) {
    // O código de rastreio geralmente está dentro do comando do código de barras (^BC) ou QR Code.
    // Este regex busca pelo padrão "BR" seguido de 14 caracteres (números e letras).
    const match = zplContent.match(/\^FD(BR[A-Z0-9]{14})\^FS/);
    if (match) return match[1];

    // Fallback: Tenta encontrar no conteúdo do código de barras diretamente.
    const barcodeMatch = zplContent.match(/\^BC[N,R,F,B,D].*?\^FD(BR[A-Z0-9]{14})\^FS/);
    return barcodeMatch ? barcodeMatch[1] : null;
}

function triggerShopeeZplUpload() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.zpl,.txt'; // Aceita arquivos .zpl e .txt
    fileInput.multiple = true; // Permite selecionar vários arquivos de uma vez
    fileInput.onchange = (event) => {
        if (event.target.files.length > 0) {
            processarEtiquetasShopeeZPL(event.target.files);
        }
    };
    fileInput.click();
}





// script.js

// =================================================================================
// MÓDULO DE CHAT INTERNO - VERSÃO 3.0 (COM GERENCIAMENTO DE GRUPO E DRAG-AND-DROP)
// =================================================================================

let conversaAtivaId = null;
let onlineUsers = {};
let grupoParaGerenciar = null;
let anexoParaEnviar = null;

// Simula a atividade do usuário para o status "online"
function updateUserActivity() {
    if (currentUser) {
        localStorage.setItem(`activity_${currentUser.username}`, new Date().toISOString());
    }
}

// Verifica a atividade de outros usuários
function checkOnlineStatus() {
    onlineUsers = {};
    users.forEach(user => {
        const lastActivity = localStorage.getItem(`activity_${user.username}`);
        if (lastActivity) {
            const diff = new Date() - new Date(lastActivity);
            if (diff < 30000) { // Online nos últimos 30 segundos
                onlineUsers[user.username] = 'online';
            }
        }
    });
    if (document.getElementById('chat') && !document.getElementById('chat').classList.contains('hidden')) {
        renderListaConversas();
        if (conversaAtivaId && !conversaAtivaId.startsWith('grupo-')) {
            const outroUsuario = conversaAtivaId.replace(currentUser.username, '').replace('-', '');
            const statusEl = document.getElementById('chat-header-status');
            statusEl.innerText = onlineUsers[outroUsuario] ? 'Online' : 'Offline';
            statusEl.className = `text-xs font-semibold ${onlineUsers[outroUsuario] ? 'text-green-600' : 'text-gray-500'}`;
        }
    }
}

setInterval(updateUserActivity, 10000);
setInterval(checkOnlineStatus, 5000);

function loadChat() {
    if (!hasPermission('chat', 'visualizar')) return;
    checkOnlineStatus();
    renderListaConversas();
    
    if (conversaAtivaId) {
        abrirConversa(conversaAtivaId);
    } else {
        document.getElementById('janela-chat-vazia').style.display = 'flex';
        document.getElementById('janela-chat-ativa').style.display = 'none';
    }
    
    const chatInput = document.getElementById('chat-input-mensagem');
    chatInput.removeEventListener('keydown', handleChatInputKey);
    chatInput.addEventListener('keydown', handleChatInputKey);

    applyPermissionsToUI();
}

function handleChatInputKey(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        enviarMensagemChat();
    }
}

function renderListaConversas() {
    const container = document.getElementById('lista-conversas');
    container.innerHTML = '';

    const grupos = users.filter(u => u.isGroup && u.members.includes(currentUser.username));
    grupos.forEach(grupo => {
        const ultimaMsg = conversas.filter(c => c.conversaId === grupo.username).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
        const naoLidas = conversas.filter(c => c.conversaId === grupo.username && !c.lidaPor.includes(currentUser.username)).length;
        container.innerHTML += `
            <div onclick="abrirConversa('${grupo.username}')" class="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-100 ${conversaAtivaId === grupo.username ? 'bg-indigo-50' : ''}">
                <div class="w-12 h-12 bg-gray-500 text-white rounded-full flex items-center justify-center font-bold text-xl"><i class="fas fa-users"></i></div>
                <div class="flex-grow overflow-hidden">
                    <p class="font-bold text-gray-800">${grupo.groupName}</p>
                    <p class="text-xs text-gray-500 truncate">${ultimaMsg ? `${ultimaMsg.remetente}: ${ultimaMsg.texto || 'Mídia'}` : 'Nenhuma mensagem.'}</p>
                </div>
                ${naoLidas > 0 ? `<span class="bg-red-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">${naoLidas}</span>` : ''}
            </div>
        `;
    });

    users.forEach(user => {
        if (user.isGroup || user.username === currentUser.username) return;
        const conversaId = [currentUser.username, user.username].sort().join('-');
        const mensagensDaConversa = conversas.filter(c => c.conversaId === conversaId);
        const ultimaMsg = mensagensDaConversa.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
        const naoLidas = mensagensDaConversa.filter(c => c.destinatario === currentUser.username && !c.lidaPor.includes(currentUser.username)).length;
        const isOnline = onlineUsers[user.username] === 'online';
        container.innerHTML += `
            <div onclick="abrirConversa('${conversaId}', '${user.username}')" class="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-100 ${conversaAtivaId === conversaId ? 'bg-indigo-50' : ''}">
                <div class="relative w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-xl">
                    ${user.username.charAt(0).toUpperCase()}
                    ${isOnline ? '<span class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></span>' : ''}
                </div>
                <div class="flex-grow overflow-hidden">
                    <p class="font-bold text-gray-800">${user.username}</p>
                    <p class="text-xs text-gray-500 truncate">${ultimaMsg ? (ultimaMsg.remetente === currentUser.username ? 'Você: ' : '') + (ultimaMsg.texto || 'Mídia') : 'Nenhuma mensagem.'}</p>
                </div>
                ${naoLidas > 0 ? `<span class="bg-red-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">${naoLidas}</span>` : ''}
            </div>
        `;
    });
}

function abrirConversa(id, nomeOutroUsuario) {
    conversaAtivaId = id;
    document.getElementById('janela-chat-vazia').style.display = 'none';
    document.getElementById('janela-chat-ativa').style.display = 'flex';

    const headerNome = document.getElementById('chat-header-nome');
    const headerAvatar = document.getElementById('chat-header-avatar');
    const headerStatus = document.getElementById('chat-header-status');
    const btnGerenciarGrupo = document.getElementById('btn-gerenciar-grupo');

    const user = users.find(u => u.username === nomeOutroUsuario);
    const grupo = users.find(u => u.isGroup && u.username === id);
    const isAdmin = currentUser.role === 'admin-master' || currentUser.role === 'admin-setor';

    if (grupo) {
        headerNome.innerText = grupo.groupName;
        headerAvatar.innerHTML = '<i class="fas fa-users"></i>';
        headerStatus.innerText = `${grupo.members.length} membros`;
        headerStatus.className = 'text-xs text-gray-500';
        btnGerenciarGrupo.style.display = isAdmin ? 'block' : 'none';
    } else if (user) {
        headerNome.innerText = user.username;
        headerAvatar.innerHTML = user.username.charAt(0).toUpperCase();
        const isOnline = onlineUsers[user.username] === 'online';
        headerStatus.innerText = isOnline ? 'Online' : 'Offline';
        headerStatus.className = `text-xs font-semibold ${isOnline ? 'text-green-600' : 'text-gray-500'}`;
        btnGerenciarGrupo.style.display = 'none';
    }

    renderMensagens();
    renderListaConversas();
}

function renderMensagens() {
    const container = document.getElementById('chat-corpo-mensagens');
    const mensagensDaConversa = conversas
        .filter(c => c.conversaId === conversaAtivaId)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    container.innerHTML = mensagensDaConversa.map(msg => {
        const isMinha = msg.remetente === currentUser.username;
        const alinhamento = isMinha ? 'justify-end' : 'justify-start';
        const corBalao = isMinha ? 'bg-indigo-500 text-white' : 'bg-gray-200 text-gray-800';
        
        let conteudoMsg = '';
        if (msg.anexo) {
            if (msg.anexo.tipo.startsWith('image/')) {
                conteudoMsg = `<img src="${msg.anexo.conteudo}" alt="Anexo" class="rounded-lg max-w-xs cursor-pointer" onclick="openImageZoomModal('${msg.anexo.conteudo}')">`;
            } else if (msg.anexo.tipo.startsWith('video/')) {
                conteudoMsg = `<video src="${msg.anexo.conteudo}" controls class="rounded-lg max-w-xs"></video>`;
            } else {
                conteudoMsg = `<a href="${msg.anexo.conteudo}" download="${msg.anexo.nome}" class="flex items-center gap-2 p-2 bg-black/20 rounded-lg hover:bg-black/30"><i class="fas fa-file-download"></i><span>${msg.anexo.nome}</span></a>`;
            }
        }
        
        if (msg.texto) {
            const urlRegex = /(https?:\/\/[^\s]+ )/g;
            const textoComLinks = msg.texto.replace(urlRegex, '<a href="$1" target="_blank" class="underline hover:text-blue-300">$1</a>');
            conteudoMsg += `<p class="text-sm whitespace-pre-wrap ${msg.anexo ? 'mt-2' : ''}">${textoComLinks}</p>`;
        }

        return `
            <div class="flex ${alinhamento}">
                <div class="max-w-xs md:max-w-md p-3 rounded-2xl ${corBalao}">
                    ${!isMinha && conversaAtivaId.startsWith('grupo-') ? `<p class="text-xs font-bold mb-1 ${isMinha ? 'text-indigo-200' : 'text-indigo-600'}">${msg.remetente}</p>` : ''}
                    <div class="text-sm">${conteudoMsg}</div>
                    <p class="text-xs mt-2 opacity-70 text-right">${new Date(msg.timestamp).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}</p>
                </div>
            </div>
        `;
    }).join('');

    container.scrollTop = container.scrollHeight;

    mensagensDaConversa.forEach(msg => {
        if ((msg.destinatario === currentUser.username || msg.conversaId.startsWith('grupo-')) && !msg.lidaPor.includes(currentUser.username)) {
            msg.lidaPor.push(currentUser.username);
        }
    });
    saveData();
    updateNotificationCounter();
}

function enviarMensagemChat() {
    if (!hasPermission('chat', 'enviar')) return;
    const input = document.getElementById('chat-input-mensagem');
    const texto = input.value.trim();
    if (!texto || !conversaAtivaId) return;

    let destinatario = conversaAtivaId.startsWith('grupo-') ? conversaAtivaId : conversaAtivaId.replace(currentUser.username, '').replace('-', '');

    conversas.push({
        id: `msg-${Date.now()}`, conversaId: conversaAtivaId, remetente: currentUser.username,
        destinatario: destinatario, texto: texto, anexo: null,
        timestamp: new Date().toISOString(), lidaPor: [currentUser.username]
    });
    saveData();
    input.value = '';
    renderMensagens();
    renderListaConversas();
}

/**
 * Processa o arquivo, gera a pré-visualização e exibe o modal.
 * @param {File} file - O arquivo a ser processado.
 */
function processarArquivoParaAnexo(file) {
    if (!file || !conversaAtivaId) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        // Guarda os dados do arquivo em uma variável global temporária
        anexoParaEnviar = { 
            nome: file.name, 
            tipo: file.type, 
            conteudo: e.target.result 
        };

        const previewContainer = document.getElementById('anexo-preview-container');
        
        // Mostra a imagem, vídeo ou um ícone genérico
        if (file.type.startsWith('image/')) {
            previewContainer.innerHTML = `<img src="${e.target.result}" alt="Preview" class="max-h-full max-w-full object-contain rounded-lg">`;
        } else if (file.type.startsWith('video/')) {
            previewContainer.innerHTML = `<video src="${e.target.result}" controls class="max-h-full max-w-full rounded-lg"></video>`;
        } else {
            previewContainer.innerHTML = `
                <div class="text-center p-8 text-white">
                    <i class="fas fa-file-alt text-6xl text-gray-400"></i>
                    <p class="mt-4 text-lg font-semibold">${file.name}</p>
                </div>`;
        }

        // Abre o modal
        document.getElementById('anexo-preview-modal').classList.remove('hidden');
        document.getElementById('anexo-legenda-input').focus();
    };
    reader.readAsDataURL(file);
}


/**
 * Função chamada quando um arquivo é selecionado no input.
 * Ela lê o arquivo e abre o modal de pré-visualização.
 * @param {Event} event - O evento do input de arquivo.
 */
function enviarAnexoChat(event) {
    if (!hasPermission('chat', 'enviar')) return;
    const file = event.target.files[0];
    if (!file) return;

    processarArquivoParaAnexo(file);
    
    // Limpa o valor do input para permitir selecionar o mesmo arquivo novamente
    event.target.value = '';
}


/**
 * Fecha o modal de pré-visualização e limpa os dados temporários.
 */
function cancelarEnvioAnexo() {
    document.getElementById('anexo-preview-modal').classList.add('hidden');
    document.getElementById('anexo-legenda-input').value = ''; // Limpa a legenda
    anexoParaEnviar = null; // Limpa o anexo temporário
}


/**
 * Confirma o envio do anexo com a legenda.
 */
function confirmarEnvioAnexo() {
    if (!anexoParaEnviar || !conversaAtivaId) return;

    const legenda = document.getElementById('anexo-legenda-input').value.trim();
    let destinatario = conversaAtivaId.startsWith('grupo-') 
        ? conversaAtivaId 
        : conversaAtivaId.replace(currentUser.username, '').replace('-', '');

    // Cria a nova mensagem com o anexo e a legenda
    conversas.push({
        id: `msg-${Date.now()}`,
        conversaId: conversaAtivaId,
        remetente: currentUser.username,
        destinatario: destinatario,
        texto: legenda, // A legenda vai aqui
        anexo: anexoParaEnviar, // O anexo vai aqui
        timestamp: new Date().toISOString(),
        lidaPor: [currentUser.username]
    });

    saveData();
    renderMensagens(); // Atualiza a janela de chat com a nova mensagem
    renderListaConversas(); // Atualiza a lista de conversas à esquerda
    cancelarEnvioAnexo(); // Fecha o modal e limpa tudo
}

function abrirModalCriarGrupo() {
    const modal = document.getElementById('criar-grupo-modal');
    const listaMembros = document.getElementById('lista-membros-grupo');
    listaMembros.innerHTML = '';
    users.forEach(user => {
        if (!user.isGroup && user.username !== currentUser.username) {
            listaMembros.innerHTML += `<label class="flex items-center p-2 rounded-md hover:bg-gray-100"><input type="checkbox" value="${user.username}" class="h-4 w-4 mr-3"><span>${user.username}</span></label>`;
        }
    });
    modal.classList.remove('hidden');
}

function fecharModalCriarGrupo() {
    document.getElementById('criar-grupo-modal').classList.add('hidden');
}

function criarGrupoChat() {
    const nomeGrupo = document.getElementById('nome-grupo-input').value.trim();
    if (!nomeGrupo) {
        showToast('O nome do grupo é obrigatório.', 'error');
        return;
    }
    const membrosSelecionados = Array.from(document.querySelectorAll('#lista-membros-grupo input:checked')).map(chk => chk.value);
    if (membrosSelecionados.length < 1) {
        showToast('Selecione pelo menos um membro para o grupo.', 'error');
        return;
    }
    membrosSelecionados.push(currentUser.username);
    const novoGrupo = {
        username: `grupo-${Date.now()}`, isGroup: true, groupName: nomeGrupo,
        members: [...new Set(membrosSelecionados)], createdBy: currentUser.username
    };
    users.push(novoGrupo);
    saveData();
    showToast(`Grupo "${nomeGrupo}" criado com sucesso!`, 'success');
    fecharModalCriarGrupo();
    renderListaConversas();
}



// script.js

// =================================================================================
// FUNÇÕES PARA ASSOCIAÇÃO VISUAL DE ETIQUETAS (VERSÃO FINAL CORRIGIDA )
// =================================================================================

// Variável global para guardar o estado do processo de associação
let associacaoPendente = {
    pdfDoc: null,       // O objeto PDF carregado pela pdf.js para visualização
    pdfBase64: null,    // O PDF em formato Base64 para ser salvo
    paginaAtual: 1,
    totalPaginas: 0
};

/**
 * Aciona o input para o usuário selecionar o arquivo PDF da Shopee.
 */
function triggerShopeePdfUpload() {
    if (!hasPermission('expedicao', 'editar')) {
        showToast('Permissão negada para associar etiquetas.', 'error');
        return;
    }
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.pdf';
    fileInput.onchange = (event) => {
        const file = event.target.files[0];
        if (file) {
            iniciarAssociacaoVisual(file);
        }
    };
    fileInput.click();
}

/**
 * Inicia o processo de associação, carregando o PDF e abrindo o modal.
 */
async function iniciarAssociacaoVisual(file) {
    const modal = document.getElementById('associacao-visual-modal');
    const statusEl = document.getElementById('associacao-modal-status');

    modal.classList.remove('hidden');
    statusEl.innerText = 'Carregando arquivo PDF...';

    try {
        const pdfData = await file.arrayBuffer();
        
        // Converte para Base64 para ser salvo posteriormente
        const pdfBase64 = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(file);
        });

        // Carrega o objeto PDF para visualização
        const pdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;

        associacaoPendente = {
            pdfDoc: pdfDoc,
            pdfBase64: pdfBase64, // Armazena o formato que pode ser salvo
            paginaAtual: 1,
            totalPaginas: pdfDoc.numPages
        };

        await renderizarConteudoModalAssociacao();

    } catch (error) {
        console.error("Erro ao iniciar associação visual:", error);
        showToast('Falha ao ler o arquivo PDF.', 'error');
        fecharModalAssociacaoVisual();
    }
}

/**
 * Função central que renderiza a página atual do PDF e a lista de pacotes.
 */
async function renderizarConteudoModalAssociacao() {
    const { pdfDoc, paginaAtual, totalPaginas } = associacaoPendente;

    const previewContainer = document.getElementById('associacao-etiqueta-preview');
    const listaPacotesContainer = document.getElementById('associacao-lista-pacotes');
    const statusEl = document.getElementById('associacao-modal-status');
    const contadorPaginasEl = document.getElementById('contador-paginas-etiqueta');
    const btnAnterior = document.getElementById('btn-etiqueta-anterior');
    const btnProxima = document.getElementById('btn-etiqueta-proxima');

    statusEl.innerText = `Navegue e selecione o pacote correspondente à etiqueta.`;
    contadorPaginasEl.innerText = `Página ${paginaAtual} de ${totalPaginas}`;
    previewContainer.innerHTML = '<p class="text-gray-500 animate-pulse">Renderizando etiqueta...</p>';

    btnAnterior.disabled = (paginaAtual <= 1);
    btnProxima.disabled = (paginaAtual >= totalPaginas);

    const page = await pdfDoc.getPage(paginaAtual);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    const context = canvas.getContext('2d');
    await page.render({ canvasContext: context, viewport: viewport }).promise;
    previewContainer.innerHTML = `<img src="${canvas.toDataURL()}" alt="Etiqueta ${paginaAtual}" class="max-w-full rounded-lg shadow-lg">`;

    const { pacotesCompletos } = getStatusTodosPacotes();
    const pacotesSemEtiqueta = pacotesCompletos.filter(p => {
        const item = expedicao.find(e => e.pedidoId === p.id);
        return item && !item.pdfEtiqueta && !item.zplContent;
    });

    if (pacotesSemEtiqueta.length === 0) {
        listaPacotesContainer.innerHTML = '<p class="text-center font-semibold text-green-600 p-4">Todos os pacotes prontos já possuem etiqueta!</p>';
    } else {
        listaPacotesContainer.innerHTML = pacotesSemEtiqueta.map(pacote => {
            const skuPrincipal = Object.keys(pacote.skus)[0] || 'N/A';
            return `
                <button onclick="confirmarAssociacaoVisual('${pacote.id}')" class="w-full text-left p-3 rounded-lg border hover:bg-indigo-100 hover:border-indigo-500 transition-all">
                    <p class="font-bold text-indigo-800">${pacote.id}</p>
                    <p class="text-sm text-gray-600">SKU principal: ${skuPrincipal} (${pacote.itensPresentes.length} itens)</p>
                </button>
            `;
        }).join('');
    }
}

/**
 * Permite navegar entre as páginas do PDF.
 */
async function navegarEtiqueta(direcao) {
    const novaPagina = associacaoPendente.paginaAtual + direcao;
    if (novaPagina > 0 && novaPagina <= associacaoPendente.totalPaginas) {
        associacaoPendente.paginaAtual = novaPagina;
        await renderizarConteudoModalAssociacao();
    }
}

/**
 * Executa a associação da página ATUAL da etiqueta ao ID do pacote clicado.
 * @param {string} pedidoId - O ID do pacote que o usuário selecionou.
 */
async function confirmarAssociacaoVisual(pedidoId) {
    if (!associacaoPendente.pdfBase64) {
        showToast('Erro: Nenhuma etiqueta pendente para associar.', 'error');
        return;
    }

    const itensDoPedido = expedicao.filter(item => item.pedidoId === pedidoId && item.status !== 'Enviado');

    if (itensDoPedido.length > 0) {
        // *** AQUI ESTÁ A CORREÇÃO PRINCIPAL ***
        // Salva o PDF em Base64 (que é uma string) e o número da página.
        // Isso é seguro para o JSON.stringify.
        itensDoPedido.forEach(item => {
            item.pdfEtiqueta = associacaoPendente.pdfBase64; 
            item.numeroPaginaEtiqueta = associacaoPendente.paginaAtual;
        });

        saveData(); // Agora esta função não dará mais erro.
        loadExpedicao();
        showToast(`Etiqueta (Pág. ${associacaoPendente.paginaAtual}) associada ao pedido ${pedidoId}!`, 'success');
        logAction({
            acao: 'Etiqueta PDF associada visualmente',
            modulo: 'Expedição',
            funcao: 'confirmarAssociacaoVisual',
            detalhes: { pedidoId: pedidoId, pagina: associacaoPendente.paginaAtual }
        });
        
        // Atualiza a lista de pacotes no modal para remover o que foi associado.
        await renderizarConteudoModalAssociacao();
    } else {
        showToast(`Nenhum item ativo encontrado na expedição para o pedido ${pedidoId}.`, 'error');
    }
}

/**
 * Fecha o modal de associação visual e reseta o estado.
 */
function fecharModalAssociacaoVisual() {
    const modal = document.getElementById('associacao-visual-modal');
    modal.classList.add('hidden');
    associacaoPendente = { pdfDoc: null, pdfBase64: null, paginaAtual: 1, totalPaginas: 0 };
}

/**
 * Imprime a etiqueta e dá baixa no pacote.
 * VERSÃO CORRIGIDA: Usa a biblioteca pdf-lib para extrair a página do Base64.
 */
async function imprimirEtiquetaEDarBaixa(pedidoId) {
    const itemExpedicao = expedicao.find(item => item.pedidoId === pedidoId);
    if (!itemExpedicao) {
        showToast('Erro: Pacote não encontrado na expedição.', 'error');
        return;
    }

    let etiquetaImpressa = false;
    if (itemExpedicao.pdfEtiqueta && itemExpedicao.numeroPaginaEtiqueta) {
        try {
            const { PDFDocument } = PDFLib;
            
            // Carrega o PDF original a partir do Base64 armazenado
            const pdfOriginalDoc = await PDFDocument.load(itemExpedicao.pdfEtiqueta);
            
            // Cria um novo documento PDF em branco
            const novoPdfDoc = await PDFDocument.create();

            // Copia a página específica do original para o novo documento
            const [paginaCopiada] = await novoPdfDoc.copyPages(pdfOriginalDoc, [itemExpedicao.numeroPaginaEtiqueta - 1]);
            novoPdfDoc.addPage(paginaCopiada);

            // Salva o novo PDF (com uma única página) e dispara o download
            const pdfBytes = await novoPdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = `etiqueta_shopee_${pedidoId.replace('#', '')}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            showToast(`Etiqueta individual para o pedido ${pedidoId} gerada.`, 'success');
            etiquetaImpressa = true;

        } catch (error) {
            console.error("Erro ao extrair página do PDF:", error);
            showToast("Erro ao gerar a etiqueta individual. Verifique o console.", "error");
            return;
        }
    } else if (itemExpedicao.zplContent) {
        // Lógica para ZPL (Mercado Livre) permanece a mesma
        // ... (código ZPL aqui) ...
        etiquetaImpressa = true;
    }

    if (!etiquetaImpressa) {
        showToast('Nenhuma etiqueta encontrada para este pedido.', 'error');
        return;
    }

    // Lógica de dar baixa (permanece a mesma)
    let itensEnviadosCount = 0;
    expedicao.forEach(item => {
        if (item.pedidoId === pedidoId && item.status !== 'Enviado') {
            item.status = 'Enviado';
            item.dataEnvio = new Date().toISOString();
            item.usuarioEnvio = currentUser.username;
            itensEnviadosCount++;
        }
    });

    if (itensEnviadosCount > 0) {
        saveData();
        logAction({
            acao: 'Pacote enviado (baixa pós-impressão)',
            modulo: 'Expedição',
            funcao: 'imprimirEtiquetaEDarBaixa',
            detalhes: { pedidoId: pedidoId, itens: itensEnviadosCount, rastreio: itemExpedicao.codigoRastreio }
        });
        showToast(`Baixa do pacote ${pedidoId} realizada!`, 'success');
        
        loadExpedicao();
        
        const btn = document.getElementById('btn-imprimir-dar-baixa');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-check-circle"></i> Baixa Realizada`;
            btn.classList.replace('bg-blue-600', 'bg-green-600');
        }
    }
}










// =================================================================================
// MÓDULO GESTÃO DE EANS (VERSÃO 10.0 - ABAS DINÂMICAS E ABA DE ERROS)
// =================================================================================

// --- CONFIGURAÇÃO CENTRAL DAS LOJAS ---
// Para adicionar/modificar lojas, basta alterar este array.
const lojasConfigEAN = [
    { id: 'loja-outros', nome: 'Loja 1', sufixo: null, cor: 'gray' },
    { id: 'loja-f', nome: 'Loja 2 (-F)', sufixo: '-F', cor: 'blue' },
    { id: 'loja-p', nome: 'Loja 3 (-P)', sufixo: '-P', cor: 'purple' },
    { id: 'loja-v', nome: 'Loja 4 (-V)', sufixo: '-V', cor: 'teal' },
    { id: 'loja-c', nome: 'Loja 5 (-C)', sufixo: '-C', cor: 'pink' }
    // Para adicionar uma nova loja, copie uma linha acima e mude o 'id', 'nome', 'sufixo' e 'cor'.
    // Ex: { id: 'loja-x', nome: 'Loja -X', sufixo: '-X', cor: 'green' },
];

// Variáveis globais para o módulo
let errosDeImportacaoEAN = JSON.parse(localStorage.getItem('saas_errosEAN')) || [];

/**
 * Função principal que inicializa o módulo de EANs, criando a estrutura de abas dinamicamente.
 */
function renderizarModuloEANs() {
    if (!hasPermission('processadorEANs', 'visualizar')) return;

    const tabsContainer = document.getElementById('ean-loja-tabs');
    const contentContainer = document.getElementById('ean-tab-content-container');
    const totalCountEl = document.getElementById('ean-total-count');

    if (!tabsContainer || !contentContainer || !totalCountEl) return;

    tabsContainer.innerHTML = '';
    contentContainer.innerHTML = '';
    totalCountEl.innerText = listaEANs.length;

    // Renderiza as abas de cada loja configurada
    lojasConfigEAN.forEach((loja, index) => {
        const isAtivo = index === 0;
        const itensDaLoja = listaEANs.filter(item => {
            if (loja.sufixo) return item.sku.endsWith(loja.sufixo);
            return !lojasConfigEAN.some(l => l.sufixo && item.sku.endsWith(l.sufixo));
        });

        tabsContainer.innerHTML += `
            <button onclick="showEanTab('${loja.id}')" id="tab-btn-${loja.id}" 
                    class="ean-tab-btn px-4 py-3 font-semibold text-lg border-b-2 flex items-center gap-2 
                           ${isAtivo ? `border-${loja.cor}-500 text-${loja.cor}-600` : 'border-transparent text-gray-500 hover:text-gray-700'}">
                <i class="fas fa-store"></i>
                <span>${loja.nome}</span>
                <span class="bg-${loja.cor}-100 text-${loja.cor}-800 text-xs font-bold px-2 py-1 rounded-full">${itensDaLoja.length}</span>
            </button>
        `;
        
        contentContainer.innerHTML += `
            <div id="tab-content-${loja.id}" class="ean-tab-content ${isAtivo ? '' : 'hidden'}">
                <div class="bg-white/80 p-6 rounded-2xl shadow-xl">
                    <div class="flex items-center gap-4 mb-6">
                        <i class="fas fa-search text-gray-400"></i>
                        <input type="text" id="search-input-${loja.id}" class="w-full p-3 border-2 rounded-xl focus:border-${loja.cor}-500 transition" 
                               placeholder="Buscar por SKU (exato ou prefixo) ou EAN...">
                    </div>
                    <div id="result-container-${loja.id}" class="mt-4">
                        <p class="text-center text-gray-500 p-8">Use a busca acima para encontrar um item.</p>
                    </div>
                </div>
            </div>
        `;
    });

    // *** NOVA ABA DE ERROS ***
    tabsContainer.innerHTML += `
        <button onclick="showEanTab('erros')" id="tab-btn-erros" 
                class="ean-tab-btn px-4 py-3 font-semibold text-lg border-b-2 flex items-center gap-2 border-transparent text-gray-500 hover:text-gray-700">
            <i class="fas fa-exclamation-triangle text-red-500"></i>
            <span>Erros de Importação</span>
            <span id="ean-error-count" class="bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded-full">${errosDeImportacaoEAN.length}</span>
        </button>
    `;
    contentContainer.innerHTML += `
        <div id="tab-content-erros" class="ean-tab-content hidden">
            <div class="bg-white/80 p-6 rounded-2xl shadow-xl">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-bold text-red-700">Itens com Erro na Importação</h3>
                    <button onclick="limparErrosEAN()" class="bg-red-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-600" data-permission="processadorEANs:processar">
                        <i class="fas fa-trash-alt mr-2"></i>Limpar Tudo
                    </button>
                </div>
                <div id="ean-errors-container" class="space-y-2">
                    <!-- Erros serão renderizados aqui -->
                </div>
            </div>
        </div>
    `;

    // Adiciona os "escutadores" de evento para a busca em cada aba
    lojasConfigEAN.forEach(loja => {
        const searchInput = document.getElementById(`search-input-${loja.id}`);
        if (searchInput) {
            searchInput.addEventListener('keyup', (e) => buscarEAN(loja.id, e.target.value));
        }
    });

    renderizarErrosEAN();
    applyPermissionsToUI();
}

/**
 * Controla a visibilidade das abas, incluindo a nova aba de erros.
 */
function showEanTab(tabId) {
    const todasAsCores = ['gray', 'blue', 'purple', 'teal', 'pink', 'red', 'green']; // Adicione mais cores se usar na config

    document.querySelectorAll('.ean-tab-content').forEach(c => c.classList.add('hidden'));
    document.querySelectorAll('.ean-tab-btn').forEach(b => {
        b.classList.remove(...todasAsCores.map(cor => `border-${cor}-500`), ...todasAsCores.map(cor => `text-${cor}-600`));
        b.classList.add('border-transparent', 'text-gray-500');
    });

    document.getElementById(`tab-content-${tabId}`).classList.remove('hidden');
    const btn = document.getElementById(`tab-btn-${tabId}`);
    
    const lojaConfig = lojasConfigEAN.find(l => l.id === tabId);
    const cor = tabId === 'erros' ? 'red' : (lojaConfig ? lojaConfig.cor : 'gray');
    
    btn.classList.add(`border-${cor}-500`, `text-${cor}-600`);
    btn.classList.remove('border-transparent', 'text-gray-500');

    if (tabId !== 'erros') {
        document.getElementById(`search-input-${tabId}`).focus();
    }
}

/**
 * Renderiza a lista de erros na aba correspondente.
 */
function renderizarErrosEAN() {
    const container = document.getElementById('ean-errors-container');
    const countEl = document.getElementById('ean-error-count');
    if (!container || !countEl) return;

    countEl.innerText = errosDeImportacaoEAN.length;

    if (errosDeImportacaoEAN.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 p-8">Nenhum erro de importação registrado.</p>';
    } else {
        container.innerHTML = errosDeImportacaoEAN.map((erro, index) => `
            <div class="bg-red-50 border-l-4 border-red-400 p-3 flex justify-between items-center">
                <p class="text-sm text-red-800"><strong>Linha ${erro.linha}:</strong> ${erro.motivo}</p>
                <button onclick="removerErroEAN(${index})" class="text-red-400 hover:text-red-600" title="Remover este erro">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
    }
}

/**
 * Remove um erro específico da lista.
 */
function removerErroEAN(index) {
    errosDeImportacaoEAN.splice(index, 1);
    localStorage.setItem('saas_errosEAN', JSON.stringify(errosDeImportacaoEAN));
    renderizarErrosEAN();
}

/**
 * Limpa todos os erros da lista após confirmação.
 */
function limparErrosEAN() {
    if (confirm(`Tem certeza que deseja limpar todos os ${errosDeImportacaoEAN.length} erros de importação?`)) {
        errosDeImportacaoEAN = [];
        localStorage.removeItem('saas_errosEAN');
        renderizarErrosEAN();
        showToast('Lista de erros limpa com sucesso!', 'success');
    }
}

/**
 * Calcula o NCM de um item com base no seu SKU.
 * @param {string} sku - O SKU do produto.
 * @returns {string} O NCM correspondente.
 */
function calcularNCM(sku) {
    const s = sku.toUpperCase();
    if (s.startsWith('TP')) {
        return '3921.9019'; // NCM para LONA
    }
    return '6006.3220'; // NCM para TECIDO (padrão)
}

/**
 * Calcula o Peso de um item com base no seu SKU, seguindo a tabela exata.
 * VERSÃO FINAL: Extrai o prefixo de letras do início do SKU para determinar o peso,
 * ignorando sufixos de loja ou variações numéricas.
 * @param {string} sku - O SKU do produto (ex: "PVNV014-100-P", "PRDA121-F").
 * @returns {string} O Peso correspondente formatado com a unidade (ex: "0,500g").
 */
function calcularPeso(sku) {
    if (!sku) return 'N/A';

    const skuUpper = sku.toUpperCase();

    // ======================= INÍCIO DO AJUSTE =======================
    // Adicionada verificação prioritária para SKUs TP que contêm "-350".
    // Isso captura casos como "TPFS004-350-F".
    if (skuUpper.startsWith('TP') && skuUpper.includes('-350')) {
        return '3,900kg';
    }
    // ======================== FIM DO AJUSTE =========================

    // 1. Trata casos especiais primeiro, que têm prioridade sobre as regras de prefixo.
    if (skuUpper.startsWith('TPG')) {
        return '3,900kg';
    }
    
    // 2. Extrai a sequência inicial de letras do SKU.
    //    A regex /^[A-Z]+/ busca por uma ou mais letras maiúsculas no início da string.
    //    Ex: "PVNV014-100-P" -> "PVNV"
    //    Ex: "PRDA121-F" -> "PRDA"
    const match = skuUpper.match(/^[A-Z]+/);
    const prefixoCompleto = match ? match[0] : null;

    if (!prefixoCompleto) return 'N/A'; // Se não houver prefixo de letras, não é possível calcular.

    // 3. Verifica o prefixo completo contra a tabela de pesos.
    //    A ordem é do mais específico (TPP) para o mais genérico (TP).
    if (prefixoCompleto.startsWith('TPP')) return '1,500kg';
    if (prefixoCompleto.startsWith('TP')) return '1,500kg';
    if (prefixoCompleto.startsWith('PR')) return '0,300g';
    if (prefixoCompleto.startsWith('PV')) return '0,500g';
    if (prefixoCompleto.startsWith('PH')) return '0,200g';
    if (prefixoCompleto.startsWith('KC')) return '1,500kg';
    if (prefixoCompleto.startsWith('KD')) return '1,500kg';
    if (prefixoCompleto.startsWith('PC')) return '1,000kg';
    if (prefixoCompleto.startsWith('VC')) return '1,200kg';
    if (prefixoCompleto.startsWith('CL')) return '0,700g';
    if (prefixoCompleto.startsWith('RV')) return '0,800g';
    if (prefixoCompleto.startsWith('FF')) return '0,500g';

    // 4. Se nenhuma das regras acima corresponder, retorna 'N/A'.
    return 'N/A';
}



/**
 * Processa os EANs, agora salvando os erros em uma lista persistente.
 * VERSÃO CORRIGIDA: Valida a duplicidade do EAN após limpá-lo.
 */
function processarEANs() {
    if (!hasPermission('processadorEANs', 'processar')) {
        showToast('Você não tem permissão para processar EANs.', 'error');
        return;
    }

    const inputText = document.getElementById('ean-input').value.trim();
    if (!inputText) {
        showToast('A área de texto está vazia.', 'info');
        return;
    }

    const linhas = inputText.split('\n');
    let adicionados = 0;
    let novosErros = [];

    linhas.forEach((linha, index) => {
        const linhaTrim = linha.trim();
        if (!linhaTrim) return;

        const partes = linhaTrim.split(/\s+/);
        if (partes.length < 2) {
            novosErros.push({ linha: index + 1, motivo: `Formato inválido. Use: SKU EAN` });
            return;
        }
        
        const sku = partes[0].toUpperCase();
        
        // ======================= INÍCIO DA CORREÇÃO =======================
        // 1. Limpa o EAN, removendo tudo que não for número.
        const eanLimpo = partes.slice(1).join('').replace(/\D/g, '');

        // 2. Valida se o EAN limpo tem o comprimento esperado (opcional, mas recomendado).
        if (eanLimpo.length < 12 || eanLimpo.length > 14) {
             novosErros.push({ linha: index + 1, motivo: `EAN <strong>${eanLimpo}</strong> parece inválido. Verifique a quantidade de dígitos.` });
            return;
        }
        
        // 3. Verifica a duplicidade do SKU e do EAN JÁ LIMPO.
        if (listaEANs.some(item => item.sku === sku)) {
            novosErros.push({ linha: index + 1, motivo: `SKU <strong>${sku}</strong> já existe.` });
            return;
        }
        if (listaEANs.some(item => item.ean === eanLimpo)) {
            novosErros.push({ linha: index + 1, motivo: `EAN <strong>${eanLimpo}</strong> já está em uso por outro SKU.` });
            return;
        }
        // ======================== FIM DA CORREÇÃO =========================

        const lojasParaItem = {};
        lojasConfigEAN.forEach(loja => {
            lojasParaItem[loja.id] = {
                marketplaces: {
                    MERCADO: { marcado: false, por: null, em: null },
                    SHOPEE: { marcado: false, por: null, em: null },
                    MAGALU: { marcado: false, por: null, em: null },
                    SHEIN: { marcado: false, por: null, em: null },
                    SITE: { marcado: false, por: null, em: null },
                }
            };
        });

        listaEANs.push({
            id: `EAN-${Date.now()}-${Math.random()}`,
            sku: sku,
            ean: eanLimpo, // Salva o EAN já limpo
            peso: calcularPeso(sku),
            ncm: calcularNCM(sku),
            lojas: lojasParaItem
        });
        adicionados++;
    });

    // O restante da função permanece o mesmo...
    if (adicionados > 0) {
        saveData();
        showToast(`${adicionados} novos itens foram adicionados com sucesso.`, 'success');
        logAction(`${adicionados} EANs processados e adicionados com dados fiscais.`);
        renderizarModuloEANs();
    }

    if (novosErros.length > 0) {
        errosDeImportacaoEAN.push(...novosErros);
        localStorage.setItem('saas_errosEAN', JSON.stringify(errosDeImportacaoEAN));
        showToast(`Foram encontrados ${novosErros.length} erros na importação. Verifique a aba de Erros.`, 'error');
        renderizarErrosEAN();
        document.getElementById('ean-error-count').innerText = errosDeImportacaoEAN.length;
    }

    document.getElementById('ean-input').value = '';
}


/**
 * Busca itens e renderiza a tabela de resultados com todas as colunas.
 * VERSÃO CORRIGIDA: Adiciona a coluna "Peso" na tabela de resultados.
 */
function buscarEAN(lojaId, termo) {
    const resultContainer = document.getElementById(`result-container-${lojaId}`);
    const termoBusca = termo.trim().toUpperCase();

    if (!termoBusca) {
        resultContainer.innerHTML = '<p class="text-center text-gray-500 p-8">Use a busca acima para encontrar um item.</p>';
        return;
    }

    const lojaConfig = lojasConfigEAN.find(l => l.id === lojaId);
    if (!lojaConfig) return;

    const itensFiltrados = listaEANs.filter(item => {
        const pertenceALoja = lojaConfig.sufixo 
            ? item.sku.endsWith(lojaConfig.sufixo) 
            : !lojasConfigEAN.some(l => l.sufixo && item.sku.endsWith(l.sufixo));
        
        if (!pertenceALoja) return false;

        return item.sku.startsWith(termoBusca) || item.ean === termoBusca;
    });

    if (itensFiltrados.length > 0) {
        const marketplaces = ['MERCADO', 'SHOPEE', 'MAGALU', 'SHEIN', 'SITE'];
        
        // ======================= 1. CORREÇÃO NO CABEÇALHO =======================
        const tableHeader = `
            <thead class="bg-gray-100 sticky top-0 z-10">
                <tr>
                    <th class="p-3 text-left font-semibold text-gray-600">SKU</th>
                    <th class="p-3 text-left font-semibold text-gray-600">EAN</th>
                    <th class="p-3 text-left font-semibold text-gray-600">Peso</th> <!-- COLUNA ADICIONADA -->
                    <th class="p-3 text-left font-semibold text-gray-600">NCM</th>
                    ${marketplaces.map(mp => `<th class="p-2 text-center font-semibold text-gray-600">${mp}</th>`).join('')}
                    <th class="p-3 text-right font-semibold text-gray-600">Ações</th>
                </tr>
            </thead>`;

        const tableBody = `
            <tbody>
                ${itensFiltrados.map(item => {
                    const dadosDaLoja = item.lojas ? item.lojas[lojaId] : null;
                    const marketplaceCheckboxes = marketplaces.map(mp => {
                        const status = dadosDaLoja?.marketplaces?.[mp] || { marcado: false, por: null, em: null };
                        const isChecked = status.marcado;
                        const tooltip = isChecked ? `Marcado por ${status.por} em ${new Date(status.em).toLocaleString('pt-BR')}` : `Marcar como processado em ${mp}`;
                        
                        return `
                            <td class="p-3 text-center">
                                <input type="checkbox" onchange="marcarMarketplace('${item.id}', '${lojaId}', '${mp}')" 
                                       class="h-5 w-5 cursor-pointer text-indigo-600 focus:ring-indigo-500" 
                                       ${isChecked ? 'checked' : ''} title="${tooltip}">
                            </td>
                        `;
                    }).join('');

                    // ======================= 2. CORREÇÃO NO CORPO DA TABELA =======================
                    return `
                        <tr id="${item.id}" class="border-t hover:bg-gray-50">
                            <td class="p-3 font-semibold">${item.sku}</td>
                            <td class="p-3 font-mono">${item.ean}</td>
                            <td class="p-3 font-medium">${item.peso || 'N/A'}</td> <!-- CÉLULA ADICIONADA -->
                            <td class="p-3 font-mono">${item.ncm || 'N/A'}</td>
                            ${marketplaceCheckboxes}
                            <td class="p-3 text-right" data-permission="processadorEANs:processar">
                                <button onclick="abrirModalEdicaoEAN('${item.id}')" class="text-blue-500 hover:text-blue-700 mr-4" title="Editar"><i class="fas fa-pencil-alt"></i></button>
                                <button onclick="excluirEAN('${item.id}')" class="text-red-500 hover:text-red-700" title="Excluir"><i class="fas fa-trash"></i></button>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>`;

        resultContainer.innerHTML = `
            <div class="overflow-x-auto table-container">
                <table class="w-full text-sm min-w-[1200px]">${tableHeader}${tableBody}</table>
            </div>
            <p class="text-xs text-gray-500 mt-2">Exibindo ${itensFiltrados.length} resultado(s).</p>
        `;
        applyPermissionsToUI();
    } else {
        resultContainer.innerHTML = `<p class="text-center text-gray-500 p-8">Nenhum item encontrado para "<strong>${termoBusca}</strong>" nesta loja.</p>`;
    }
}


/**
 * Marca ou desmarca um item em um marketplace específico DENTRO de uma loja.
 */
function marcarMarketplace(itemId, lojaId, marketplace) {
    const item = listaEANs.find(i => i.id === itemId);
    if (!item) return;

    if (!item.lojas) item.lojas = {};
    if (!item.lojas[lojaId]) item.lojas[lojaId] = { marketplaces: {} };
    if (!item.lojas[lojaId].marketplaces[marketplace]) item.lojas[lojaId].marketplaces[marketplace] = {};

    const status = item.lojas[lojaId].marketplaces[marketplace];
    status.marcado = !status.marcado;

    if (status.marcado) {
        status.por = currentUser.username;
        status.em = new Date().toISOString();
        logAction(`EAN ${item.ean} (Loja: ${lojaId}) marcado para ${marketplace}.`);
    } else {
        status.por = null;
        status.em = null;
        logAction(`EAN ${item.ean} (Loja: ${lojaId}) desmarcado para ${marketplace}.`);
    }
    
    saveData();

    const checkbox = document.querySelector(`input[onchange="marcarMarketplace('${itemId}', '${lojaId}', '${marketplace}')"]`);
    if (checkbox) {
        const novoTooltip = status.marcado 
            ? `Marcado por ${status.por} em ${new Date(status.em).toLocaleString('pt-BR')}`
            : `Marcar como processado em ${marketplace}`;
        checkbox.title = novoTooltip;
    }
}

/**
 * Abre o modal para editar um item EAN específico.
 */
function abrirModalEdicaoEAN(itemId) {
    itemParaEditarId = itemId;
    const item = listaEANs.find(i => i.id === itemId);
    if (!item) {
        showToast('Erro: Item não encontrado.', 'error');
        return;
    }

    document.getElementById('edit-sku-input').value = item.sku;
    document.getElementById('edit-ean-input').value = item.ean;
    document.getElementById('edit-ean-modal').classList.remove('hidden');
}

/**
 * Fecha o modal de edição de EAN.
 */
function fecharModalEdicaoEAN() {
    document.getElementById('edit-ean-modal').classList.add('hidden');
    itemParaEditarId = null;
}

/**
 * Salva as alterações feitas no modal de edição de EAN.
 * VERSÃO CORRIGIDA: Valida a duplicidade do EAN após limpá-lo.
 */
function salvarEdicaoEAN() {
    if (!itemParaEditarId) return;
    const itemIndex = listaEANs.findIndex(i => i.id === itemParaEditarId);
    if (itemIndex === -1) {
        showToast('Erro: Item não encontrado para salvar.', 'error');
        return;
    }

    const itemOriginal = { ...listaEANs[itemIndex] };
    const novoSku = document.getElementById('edit-sku-input').value.trim().toUpperCase();
    
    // ======================= INÍCIO DA CORREÇÃO =======================
    // 1. Limpa o EAN digitado no modal.
    const novoEanLimpo = document.getElementById('edit-ean-input').value.trim().replace(/\D/g, '');

    if (!novoSku || !novoEanLimpo) {
        showToast('SKU e EAN não podem ser vazios.', 'error');
        return;
    }

    // 2. Verifica a duplicidade do SKU e do EAN LIMPO, ignorando o próprio item que está sendo editado.
    if (listaEANs.some(i => i.id !== itemParaEditarId && i.sku === novoSku)) {
        showToast(`Erro: O SKU ${novoSku} já existe.`, 'error');
        return;
    }
    if (listaEANs.some(i => i.id !== itemParaEditarId && i.ean === novoEanLimpo)) {
        showToast(`Erro: O EAN ${novoEanLimpo} já está em uso.`, 'error');
        return;
    }
    // ======================== FIM DA CORREÇÃO =========================

    const item = listaEANs[itemIndex];
    item.sku = novoSku;
    item.ean = novoEanLimpo; // Salva o EAN limpo
    item.peso = calcularPeso(novoSku);
    item.ncm = calcularNCM(novoSku);
    
    saveData();
    logAction(`Item EAN editado: SKU de '${itemOriginal.sku}' para '${novoSku}', EAN de '${itemOriginal.ean}' para '${novoEanLimpo}'.`);
    showToast('Item atualizado com sucesso!', 'success');
    
    fecharModalEdicaoEAN();
    
    const abaAtiva = document.querySelector('.ean-tab-btn:not(.border-transparent)');
    if (abaAtiva) {
        const lojaId = abaAtiva.id.replace('tab-btn-', '');
        const termoBusca = document.getElementById(`search-input-${lojaId}`).value;
        buscarEAN(lojaId, termoBusca);
    }
}


/**
 * Exclui um item da lista de EANs após confirmação.
 */
function excluirEAN(itemId) {
    if (confirm('Tem certeza que deseja excluir este item permanentemente?')) {
        const itemIndex = listaEANs.findIndex(i => i.id === itemId);
        if (itemIndex === -1) return;
        
        const [itemExcluido] = listaEANs.splice(itemIndex, 1);
        saveData();
        logAction(`Item EAN excluído: ${itemExcluido.sku} (EAN: ${itemExcluido.ean}).`);
        showToast('Item excluído com sucesso.', 'success');

        document.getElementById('ean-total-count').innerText = listaEANs.length;
        const abaAtiva = document.querySelector('.ean-tab-btn:not(.border-transparent)');
        if (abaAtiva) {
            const lojaId = abaAtiva.id.replace('tab-btn-', '');
            const termoBusca = document.getElementById(`search-input-${lojaId}`).value;
            buscarEAN(lojaId, termoBusca);
        }
    }
}
