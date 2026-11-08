# Mercado & Finanças — edição LocalStorage

Esta edição funciona no navegador, sem Flask e sem banco de dados de servidor. Os registros ficam no `localStorage` do perfil do navegador.

## Executar no Windows

1. Extraia a pasta `LocalStorage` para o computador.
2. Tenha Python 3 instalado.
3. Execute `iniciar_windows.bat`.
4. O aplicativo abre em `http://127.0.0.1:8000`.
5. Mantenha a janela do servidor aberta enquanto utiliza o aplicativo.

Também é possível executar manualmente, dentro desta pasta:

```bash
python -m http.server 8000 --bind 127.0.0.1
```

Depois abra `http://127.0.0.1:8000` no navegador. Não abra o `index.html` diretamente com `file://`.

## Armazenamento

- Os dados ficam no `localStorage`, associados ao navegador, perfil e endereço local utilizado.
- Limpar os dados do site, trocar de navegador ou mudar a porta pode fazer os registros parecerem ausentes.
- Use **Configurações → Exportar backup JSON** periodicamente.
- O backup contém os registros em texto legível; guarde-o em local protegido.
- O aplicativo não possui login, cofre de credenciais nem envio de dados para servidor remoto.

## Funcionalidades

- Cadastro de produtos com ícone opcional, quantidade total da embalagem, unidade e preço total.
- Geração sequencial de código interno `PRD-000001` e EAN-13 interno, com verificação de duplicidade.
- Exibição de QR Code e código de barras para cada produto.
- Pesquisa por nome, código interno e código de barras; aviso para nomes semelhantes.
- Carrinho de supermercado, listas salvas e finalização com lançamento financeiro opcional.
- Fichas de serviços/receitas com ingredientes em g, kg, ml, L ou unidade, calculados proporcionalmente ao preço da embalagem.
- Inclusão de mão de obra, gás, energia, outros custos e preço de venda.
- Salvamento de orçamento sem alterar o saldo ou registro de execução lançando o custo como despesa.
- Mensalidades e despesas recorrentes, além de cartão, empréstimo e financiamento com parcelas por ano/mês.
- Parcelas pagas ou pendentes, com ou sem lançamento no saldo; cada parcela pode ser editada.
- Movimentações manuais, relatórios anuais, exportação CSV e backup/restauração JSON.

## Observação sobre unidades e custos

Para farinha cadastrada como `1 kg` por R$ 8,50, a unidade-base é grama e o custo de 300 g será calculado como R$ 2,55. O produto continua cadastrado como uma embalagem de 1 kg; a ficha técnica registra apenas a quantidade consumida.

## Códigos de identificação

O EAN-13 é gerado com prefixo interno `200`, sequência numérica e dígito verificador válido. Trata-se de um código interno do aplicativo, não de um GTIN comercial registrado pela GS1 para identificação universal de mercadorias.
