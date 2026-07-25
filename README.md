# Guatelipe CRM — versão funcional local

## Como abrir
1. Extraia o ZIP.
2. Abra a pasta `guatelipe-crm`.
3. Dê dois cliques em `index.html`.

## O que funciona
- Cadastrar, editar, pesquisar e excluir leads.
- Arrastar leads no funil de vendas.
- Cadastrar e editar projetos.
- Cadastrar recebimentos e valores pendentes.
- Dashboard atualizado automaticamente.
- Exportar e importar backup em JSON.
- Dados salvos automaticamente no navegador por `localStorage`.

## Importante
Os dados ficam apenas no navegador e no computador em que o CRM foi usado. Não limpe os dados do navegador sem exportar um backup. Para acessar as mesmas informações em vários dispositivos será necessário publicar uma versão com banco de dados e login.

## Integração com Instagram (Meta API)
O backend oficial está pronto na pasta `backend/`. Ele faz login (OAuth), guarda o token
com segurança e recebe mensagens do Direct por webhook, criando leads automaticamente.
Veja o passo a passo de deploy em `backend/README.md`.

Depois de publicar o backend em HTTPS, configure na aba **Integrações** do CRM: informe a
URL do backend e a chave de API, clique em **Conectar Instagram** e depois em **Sincronizar Direct**.

> A ativação real na Meta exige: conta profissional, app aprovado (App Review para produção),
> permissões `instagram_manage_messages` e o backend rodando em HTTPS.
