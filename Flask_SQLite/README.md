# Mercado & Finanças — edição Flask + SQLite

Esta edição utiliza Flask como servidor local e SQLite como banco de dados nativo em arquivo. Não usa SQLite WebAssembly nem `localStorage` como persistência principal.

## Executar no Windows

1. Extraia a pasta `Flask_SQLite` para o computador.
2. Tenha Python 3.10 ou superior instalado.
3. Execute `run_windows.bat`.
4. Na primeira execução, o script cria `.venv` e instala Flask a partir de `requirements.txt`.
5. Acesse `http://127.0.0.1:5000` no navegador.
6. Mantenha a janela do servidor aberta. Para encerrar, pressione `Ctrl + C`.

Execução manual:

```bash
python -m venv .venv
# Windows:
.venv\\Scripts\\activate
pip install -r requirements.txt
python app.py
```

O banco é criado automaticamente em:

```text
Flask_SQLite/instance/mercado_financas.sqlite3
```

Faça cópias de segurança desse arquivo com o servidor encerrado. Também é possível exportar e importar um backup JSON pela tela Configurações.

## Estrutura do SQLite

O banco possui tabelas independentes para `products`, `transactions`, `services`, `service_items`, `service_runs`, `obligations`, `obligation_installments`, `purchases` e `app_settings`. As gravações de estado são atômicas: em caso de erro de validação/duplicidade, a transação é revertida.

## Funcionalidades

- As mesmas funcionalidades da edição LocalStorage.
- Persistência real em SQLite no computador.
- Restrições `UNIQUE` para nome normalizado, código interno e EAN-13 de produtos.
- Validação adicional de duplicidade no servidor, além da validação da interface.
- API local de estado e verificação de produtos semelhantes (`/api/products/check`).
- Interface servida em `127.0.0.1` por padrão; não fica exposta à rede local.

## Testes

Com Flask instalado, dentro desta pasta execute:

```bash
python -m unittest discover -s tests -v
```

Os testes verificam a gravação/leitura relacional, duplicidade de produto, busca de produtos semelhantes e endpoint de saúde do SQLite.

## Segurança e escopo

O aplicativo não possui autenticação, cofre de credenciais ou conexão bancária. Ele é destinado a uso local em um computador confiável. O backup JSON é legível e deve ser guardado com cuidado. O saldo é calculado pela soma de entradas e subtração das despesas efetivamente lançadas; parcelas e serviços salvos sem lançamento não alteram o saldo.

## Códigos de identificação

O EAN-13 é gerado com prefixo interno `200`, sequência numérica e dígito verificador válido. Trata-se de um código interno do aplicativo, não de um GTIN comercial registrado pela GS1 para identificação universal de mercadorias.
