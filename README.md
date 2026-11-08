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

- Containers: listar, criar, iniciar, parar, reiniciar, remover e consultar logs.
- Imagens: listar, baixar e remover.
- Volumes: listar, criar e remover.
- Redes: listar, criar e remover.
- Visão geral com estado da API e do Docker Engine.

Para validar o bundle de produção, execute `npm.cmd run build`.