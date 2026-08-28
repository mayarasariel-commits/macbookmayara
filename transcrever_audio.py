#!/usr/bin/env python3
"""
Transcreve um arquivo de áudio (ex.: .m4a, .mp3, .wav) para texto.

A transcrição em si roda localmente com o Whisper (OpenAI), que funciona
offline e não precisa de chave de API. Depois, o texto bruto é enviado
para o Claude (API da Anthropic) para revisão: pontuação, remoção de
vícios de linguagem e organização em parágrafos, mantendo o conteúdo e o
tom originais.

Uso:
    python3 transcrever_audio.py <arquivo_audio> <chave_api_anthropic> [modelo_whisper] [idioma]

Exemplo:
    python3 transcrever_audio.py Voz.m4a sk-ant-xxxxxxxx small pt

Requisitos:
    pip install openai-whisper anthropic
    ffmpeg instalado no sistema (necessário para o Whisper ler .m4a, .mp3 etc.)
        - macOS:  brew install ffmpeg
        - Ubuntu: sudo apt install ffmpeg
"""

import sys
from pathlib import Path
from typing import Optional

MODELOS_WHISPER_VALIDOS = {"tiny", "base", "small", "medium", "large"}


def erro_e_sai(mensagem: str, codigo: int = 1) -> None:
    print(f"Erro: {mensagem}", file=sys.stderr)
    sys.exit(codigo)


def transcrever_com_whisper(caminho_audio: str, modelo: str, idioma: Optional[str]) -> str:
    try:
        import whisper
    except ImportError:
        erro_e_sai(
            "a biblioteca 'openai-whisper' não está instalada.\n"
            "Instale com: pip install openai-whisper\n"
            "Também é necessário ter o ffmpeg instalado no sistema."
        )

    print(f"Carregando modelo Whisper '{modelo}'...")
    model = whisper.load_model(modelo)

    print(f"Transcrevendo '{caminho_audio}'... (pode levar alguns minutos)")
    opcoes = {"language": idioma} if idioma else {}

    try:
        resultado = model.transcribe(caminho_audio, **opcoes)
    except Exception as e:  # falhas do ffmpeg/whisper variam bastante
        erro_e_sai(f"falha ao transcrever o áudio: {e}")

    return resultado["text"].strip()


def revisar_com_claude(texto_bruto: str, api_key: str) -> str:
    try:
        import anthropic
    except ImportError:
        erro_e_sai(
            "a biblioteca 'anthropic' não está instalada.\n"
            "Instale com: pip install anthropic"
        )

    cliente = anthropic.Anthropic(api_key=api_key)

    print("Revisando e formatando a transcrição com Claude...")
    try:
        mensagem = cliente.messages.create(
            model="claude-opus-5",
            max_tokens=16000,
            system=(
                "Você é um assistente que revisa transcrições de áudio em "
                "português. Corrija pontuação, remova vícios de linguagem "
                "('né', 'tipo assim', repetições) somente quando isso não "
                "mudar o sentido, e organize o texto em parágrafos. Não "
                "resuma, não invente conteúdo e não adicione comentários — "
                "devolva apenas o texto revisado."
            ),
            messages=[
                {"role": "user", "content": f"Revise esta transcrição:\n\n{texto_bruto}"}
            ],
        )
    except anthropic.AuthenticationError:
        erro_e_sai("chave de API da Anthropic inválida ou sem permissão.")
    except anthropic.RateLimitError:
        erro_e_sai("limite de requisições da API da Anthropic atingido. Tente novamente em instantes.")
    except anthropic.APIStatusError as e:
        erro_e_sai(f"a API da Anthropic retornou um erro ({e.status_code}): {e.message}")
    except anthropic.APIConnectionError as e:
        erro_e_sai(f"falha de conexão com a API da Anthropic: {e}")

    partes_texto = [bloco.text for bloco in mensagem.content if bloco.type == "text"]
    return "".join(partes_texto).strip()


def main() -> None:
    if len(sys.argv) < 3:
        erro_e_sai(
            "uso: python3 transcrever_audio.py <arquivo_audio> <chave_api_anthropic> "
            "[modelo_whisper] [idioma]\n"
            "exemplo: python3 transcrever_audio.py Voz.m4a sk-ant-xxxxxxxx small pt"
        )

    caminho_audio = sys.argv[1]
    api_key = sys.argv[2]
    modelo_whisper = sys.argv[3] if len(sys.argv) > 3 else "small"
    idioma = sys.argv[4] if len(sys.argv) > 4 else "pt"

    if not Path(caminho_audio).is_file():
        erro_e_sai(f"arquivo de áudio não encontrado: {caminho_audio}")

    if modelo_whisper not in MODELOS_WHISPER_VALIDOS:
        erro_e_sai(
            f"modelo Whisper inválido: '{modelo_whisper}'. "
            f"Opções: {', '.join(sorted(MODELOS_WHISPER_VALIDOS))}"
        )

    if not api_key or api_key.startswith("sua-api-key"):
        erro_e_sai(
            "informe uma chave de API da Anthropic válida "
            "(veja https://console.anthropic.com/settings/keys)."
        )

    texto_bruto = transcrever_com_whisper(caminho_audio, modelo_whisper, idioma)

    if not texto_bruto:
        erro_e_sai("a transcrição resultou em texto vazio — verifique o arquivo de áudio.")

    texto_final = revisar_com_claude(texto_bruto, api_key)

    caminho_saida = Path(caminho_audio).with_suffix(".txt")
    caminho_saida.write_text(texto_final, encoding="utf-8")

    print("\n--- Transcrição final ---\n")
    print(texto_final)
    print(f"\nSalvo em: {caminho_saida}")


if __name__ == "__main__":
    main()
