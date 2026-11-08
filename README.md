# Mercado & Finanças — pacote com duas edições

O pacote contém duas implementações independentes, com a mesma interface e as mesmas regras funcionais:

- **LocalStorage/** — aplicação no navegador, executada por servidor HTTP estático local e com dados persistidos no perfil do navegador.
- **Flask_SQLite/** — aplicação servida por Flask, com dados persistidos em tabelas de um arquivo SQLite local.

## Qual versão escolher?

Use LocalStorage quando quiser simplicidade e não precisar de um banco de dados em arquivo. Use Flask + SQLite quando quiser persistência mais estruturada, integridade por restrições SQL e um arquivo de banco que pode ser copiado e guardado.

As duas versões mantêm armazenamento separado. Os dados de uma não aparecem automaticamente na outra. Use **Configurações → Exportar backup JSON** na origem e **Importar backup JSON** no destino para transferir registros.

## Regras importantes implementadas

**Produtos e unidades:** cada produto guarda a quantidade total da embalagem e seu preço total. A ficha de serviço converte kg para g e L para ml, calculando somente a quantidade consumida. Exemplo: 1 kg de farinha por R$ 8,50 equivale a R$ 0,0085 por grama; 300 g custam R$ 2,55.

**Identificação:** o código interno segue `PRD-000001`, `PRD-000002` etc. O código EAN-13 é gerado com prefixo interno `200` e dígito verificador. É um identificador de uso interno do aplicativo, não um GTIN comercial registrado para distribuição no varejo. O QR Code contém o código interno. A numeração é sequencial para manter a ordem dos cadastros. O sistema bloqueia nomes normalizados/códigos repetidos e alerta para nomes muito semelhantes.

**Serviços:** é possível salvar uma ficha técnica como orçamento, sem afetar o saldo, ou registrar uma execução que cria uma despesa com o custo calculado. A ficha soma ingredientes, mão de obra, gás, energia e outros custos; o preço de venda é opcional e permite visualizar a diferença estimada.

**Compromissos:** mensalidades recorrentes, energia, internet, streaming, jogos, cartão de crédito, empréstimos e financiamentos podem ser organizados por ano e mês. Cada parcela pode ficar pendente ou paga. O pagamento pode ser registrado sem lançamento financeiro ou lançado como despesa para reduzir o saldo. Para dívidas com número fixo de parcelas, o valor mensal pode ser informado diretamente ou calculado a partir do total dividido pela quantidade de parcelas.

**Saldo:** o saldo representa entradas menos despesas efetivamente lançadas. Orçamentos, listas de compras e parcelas sem lançamento não alteram o saldo.

## Remoção do cofre

O cofre de credenciais foi removido da navegação, da interface e da estrutura nova de dados. As versões novas não armazenam senhas, códigos 2FA ou dados de recuperação.

## QR Code de terceiros

O gerador QR incluído em `LocalStorage/qrcode-vendor.js` e `Flask_SQLite/static/qrcode-vendor.js` é a biblioteca QRCode de Kazuhiko Arase, distribuída sob licença MIT; o texto da licença acompanha o pacote em `THIRD_PARTY_NOTICES/QRCode-MIT.txt`.
