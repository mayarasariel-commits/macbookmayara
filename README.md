# transcrever_audio.py

Script de linha de comando para transcrever um arquivo de áudio (`.m4a`, `.mp3`, `.wav`, etc.) para texto.

## Como funciona

1. A transcrição roda **localmente** com o [Whisper](https://github.com/openai/whisper) (não precisa de chave de API para essa etapa).
2. O texto bruto é enviado para o **Claude** (API da Anthropic) para revisão: pontuação, remoção de vícios de linguagem e organização em parágrafos, mantendo o conteúdo original.
3. O resultado final é salvo em um `.txt` ao lado do áudio (ex.: `Voz.m4a` → `Voz.txt`) e também impresso na tela.

## Instalação

```bash
pip install -r requirements.txt
```

Também é necessário ter o **ffmpeg** instalado no sistema (usado pelo Whisper para ler o áudio):

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg
```

## Uso

```bash
python3 transcrever_audio.py <arquivo_audio> <chave_api_anthropic> [modelo_whisper] [idioma] [workspace_id]
```

- `arquivo_audio`: caminho do arquivo de áudio (obrigatório).
- `chave_api_anthropic`: sua chave da API da Anthropic, obtida em https://console.anthropic.com/settings/keys (obrigatório).
- `modelo_whisper`: `tiny`, `base`, `small` (padrão), `medium` ou `large` — modelos maiores são mais precisos e mais lentos.
- `idioma`: código do idioma do áudio, ex. `pt` (padrão), `en`. Deixe vazio para detecção automática.
- `workspace_id`: opcional. Só é necessário se a API retornar o erro `anthropic-workspace-id is required...` — algumas contas exigem informar o workspace junto com a chave. Também pode ser definido via variável de ambiente `ANTHROPIC_WORKSPACE_ID`.

### Exemplo

```bash
python3 transcrever_audio.py Voz.m4a sk-ant-xxxxxxxxxxxxxxxx
```

> **Atenção:** nunca commite sua chave de API real no repositório. Prefira passá-la via variável de ambiente em scripts automatizados.
