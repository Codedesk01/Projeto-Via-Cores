
---

# 📦 Sistema de Controle de Estoque com Leitor de Código de Barras

Este é um sistema simples de controle de estoque desenvolvido em Python, com interface gráfica baseada em `tkinter`. Permite realizar entrada e saída de produtos utilizando código de barras, gerenciar as quantidades e visualizar o status do estoque em tempo real.

## 🚀 Funcionalidades

* 📥 Adição de produtos por código de barras
* 📤 Retirada de produtos do estoque
* 🔎 Campo pronto para leitura automática de código de barras
* 📊 Visualização do estoque atual
* 💾 Salvamento automático em arquivo `.csv`
* 🖨️ Geração de etiquetas com código de barras (em PDF)
* 🖱 Interface gráfica intuitiva (sem terminal)

## 🛠️ Tecnologias Utilizadas

* Python 3
* Tkinter (interface gráfica)
* Pandas (manipulação de dados)
* ReportLab (geração de PDFs)
* Pillow (imagens)
* OS / Time (utilitários do sistema)

## 🖥️ Como Usar

### 1. Pré-requisitos

* Ter o Python 3 instalado
* Instalar as dependências:

```bash
pip install pandas reportlab pillow
```

### 2. Executar o sistema

Este sistema foi desenvolvido com extensão `.pyw`, ou seja, ele roda sem abrir o terminal.

Para iniciar:

```bash
Clique duas vezes no arquivo `app.pyw` ou execute:
pythonw app.pyw
```

### 3. Funcionalidades básicas

* Ao abrir o sistema, o campo de código de barras já está pronto para leitura.
* Para **adicionar** um produto, leia o código de barras e clique em “Adicionar”.
* Para **retirar**, leia o código e clique em “Retirar”.
* Clique em “Mostrar Estoque” para visualizar os itens organizados de A-Z.
* É possível gerar **PDFs com códigos de barras** e relatórios.

## 📂 Estrutura dos Arquivos

```
📁 SeuProjeto/
├── app.pyw               # Código principal do sistema
├── estoque.csv           # Arquivo onde os dados do estoque são salvos
├── etiquetas/            # Pasta onde os PDFs gerados são armazenados
```

## 📌 Observações

* O sistema foi desenvolvido para uso local em múltiplos computadores conectados em rede.
* Ideal para empresas pequenas que precisam de um sistema rápido e funcional de controle de estoque por código de barras.

## 🧑‍💻 Autor

Desenvolvido por \CodeDesk01

---
