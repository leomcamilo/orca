# Orca Leo

O Orca Leo é o build pessoal do Leo: o Orca com o modo Voz antes de ele chegar ao Orca oficial.
Existe só no fork `leomcamilo/orca` e nunca é publicado como release.

Ele é temporário. Quando o modo Voz entrar no Orca oficial, o plano é voltar ao app oficial.

## O que ele tem a mais

- Modo Voz nos chats Codex. É a contribuição enviada ao Orca oficial no PR
  [stablyai/orca#41705](https://github.com/stablyai/orca/pull/41705), branch `feat/codex-native-voice`.
- Respostas lidas em voz alta e escuta por turnos nos chats Claude e OpenCode. Fica na branch
  `feat/native-chat-spoken-replies` e ainda não foi proposta ao Orca oficial.
- Atualizador desligado. O Orca Leo só muda por um build novo; o canal oficial trocaria o app por um
  sem o modo Voz.

O código próprio do Orca Leo é pequeno e fica em três lugares:

| Caminho                                         | O que faz                            |
| ----------------------------------------------- | ------------------------------------ |
| `config/orca-leo/electron-builder.orca-leo.cjs` | Configuração do pacote               |
| `src/shared/orca-leo/orca-leo-distribution.ts`  | Nome exibido e atualizador desligado |
| `.github/workflows/orca-leo-mac.yml`            | Verificação e build                  |

Nada disso entra em PR para o Orca oficial.

## O que muda de nome e o que não muda

O Orca Leo roda no lugar do Orca oficial, com o mesmo perfil. Por isso só o nome que a pessoa vê
muda.

Aparece como "Orca Leo":

- a pasta do app, `Orca Leo.app`;
- o nome no Finder, no Dock, no alternador de apps, na barra de menus e nas listas de Privacidade e
  Segurança;
- os itens "Sobre", "Ocultar" e "Encerrar" do menu do app e o painel "Sobre";
- o título da janela, o nome na barra de título e a linha do app no uso de recursos;
- o texto dos pedidos de permissão do macOS;
- a versão, no formato `1.4.258-leo.2`;
- o workflow, as tags `orca-leo-v*` e o arquivo do build, `Orca-Leo-<versão>-arm64.zip`.

Continua com o nome do Orca, por compatibilidade:

| Identificador                           | Valor                                | Por que fica                                                                         |
| --------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| Bundle id                               | `com.stablyai.orca`                  | Permissões do macOS, item do Keychain e serviços de terminal são ligados a ele       |
| `CFBundleName`, executável e auxiliares | `Orca`, `Orca Helper`                | O Electron localiza os processos auxiliares por esse nome                            |
| Nome interno do app                     | `Orca`                               | Dele saem a pasta do perfil e o nome do item no Keychain                             |
| Perfil                                  | `~/Library/Application Support/orca` | Guarda projetos, sessões e históricos                                                |
| Protocolo e CLI                         | `orca://`, `orca`                    | Usados por links, terminais e agentes                                                |
| Textos da interface                     | "Orca"                               | São os textos do Orca oficial; trocá-los geraria conflito a cada atualização da base |
| Repositório                             | `leomcamilo/orca`                    | É a origem do PR #41705                                                              |

Ainda aparece como "Orca", sem ser por compatibilidade:

- a dica da bandeja na barra de menus e o aviso único "Orca is still running in the system tray".
  Trocar exige alterar testes do Orca oficial que fixam esse texto;
- a tela de boas-vindas e o diálogo de relatório de falha, que aparecem raramente;
- as frases da interface. São 1.370 textos em 11 idiomas e não dá para trocar em bloco: muitos falam
  do produto e do serviço oficiais ("Needs Orca 1.4 or later", "Orca is open source", Orca Cloud,
  Orca Mobile), e a troca os deixaria errados.

Os builds anteriores usavam os nomes `leo-voice` e `Orca Voice`. As tags `leo-voice-v*` e as branches
`leo/voice-*` ficam no fork como histórico.

## Como sai um build

1. A branch de build é `orca-leo/main-<base>`, onde `<base>` é o commit do Orca oficial em que ela se
   apoia. Ela empilha o modo Voz, as respostas faladas e um commit de distribuição.
2. Uma tag `orca-leo-v<versão>` nessa branch dispara o workflow. A versão segue `X.Y.Z-leo.N`, com
   `X.Y.Z` igual à versão do Orca oficial instalada.
3. O workflow roda o `check:changed` do repositório contra a base do Orca oficial. Só depois empacota para Mac
   com Apple Silicon.
4. O resultado é um zip com `Orca Leo.app`, com assinatura ad-hoc e sem notarização, e o hash
   SHA-256 ao lado.

Uma tag `orca-leo-check-<rótulo>` roda só a verificação, sem empacotar.

## Instalação no Mac do Leo

O zip do workflow é assinado localmente com a identidade Apple Development do Leo antes de ser
instalado em `~/orca-leo/Orca Leo.app`. A assinatura estável mantém as permissões do macOS entre um
build e outro. Os scripts de assinatura, verificação, troca e retorno ficam fora do repositório, em
`~/Library/Application Support/orca-leo/`.

O app assinado assim vale só para os aparelhos do Leo. Não é para distribuir.
