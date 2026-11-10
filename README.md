# Docker Desk

Painel web em React para consultar e administrar containers, imagens, volumes e redes usando a API FastAPI existente.

## Executar

1. Inicie o Docker Desktop (ou outro daemon Docker compatível).
2. Inicie o backend em `C:\infra\docker`:

   ```powershell
   .\venv\Scripts\Activate.ps1
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```

3. Na pasta deste projeto, instale as dependências e inicie o frontend:

   ```powershell
   npm.cmd install
   npm.cmd run dev
   ```

4. Abra `http://localhost:5173`.

O Vite encaminha `/api` e `/health` para `http://127.0.0.1:8000`; assim, o backend não precisa habilitar CORS para o ambiente local.

## Recursos

- Containers: listar, criar, iniciar, parar, reiniciar, remover, consultar logs, abrir aplicações com portas web publicadas e executar comandos em containers ativos.
- Imagens: listar, baixar e remover.
- Volumes: listar, criar e remover.
- Redes: listar, criar e remover; conectar ou desconectar containers, consultar sub-rede, gateway e IPs internos.
- Conectividade: consultar e copiar os endereços IPv4 da máquina para acesso por outros dispositivos da rede local.
- Redes: testar ping escolhendo um container de origem e outro container ou endereço IP/nome como destino; são enviados até quatro pacotes, com limite de dez segundos.
- Visão geral com estado da API e do Docker Engine.

O IP de um container é interno à rede Docker. Para acessar um serviço de outro dispositivo, use o IP da máquina e uma porta publicada no container. Em redes bridge criadas pelo usuário, os containers conectados também podem se localizar pelo nome.

O ping executado dentro de um container requer que a imagem de origem tenha o comando `ping` instalado; imagens mínimas podem não incluí-lo.

O terminal permite executar comandos dentro de containers ativos. Mantenha a API acessível apenas a pessoas confiáveis e não a exponha à internet.

Para validar o bundle de produção, execute `npm.cmd run build`.