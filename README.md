# Sistema Ameaça · Disparo para Owlbear Rodeo

Extensão para selecionar um personagem, um alvo e uma imagem de animação. Ao disparar, a extensão troca temporariamente a imagem do personagem original, toca um efeito sonoro local e restaura a imagem original após 4.000 ms.

## Instalação

Manifesto para instalação no Owlbear Rodeo:

`https://onze1onze.github.io/Ficha-de-Amea-a-/manifest.json`

O endereço depende da ativação do GitHub Pages para este repositório. O workflow `.github/workflows/pages.yml` publica a raiz do projeto quando a opção **GitHub Actions** está habilitada em Settings → Pages.

## Uso

1. Adicione a extensão ao perfil do Owlbear Rodeo pelo endereço do manifesto.
2. Ative a extensão na sala.
3. Selecione o personagem (imagem na camada CHARACTER), o alvo e a imagem que servirá como aparência temporária.
4. Pressione **DISPARAR**.

A operação altera somente `image.url`, `image.mime` e uma chave de controle namespaced em `metadata` do personagem. O ID do item permanece o mesmo. O alvo não é alterado. O token escolhido como recurso é apenas lido, nunca removido ou modificado.

## Arquitetura

- `manifest.json`: manifesto do Owlbear Rodeo.
- `index.html`, `style.css`, `src/main.js`: painel compacto.
- `background.html`, `src/background.js`: controlador persistente da animação e restauração, mesmo quando o popover fecha.
- `src/shot-engine.js`: regras puras da operação e validações.
- `audio/shotgun-20-gauge.mp3`: efeito sonoro local.
- `.github/workflows/pages.yml`: publicação estática no GitHub Pages.

O projeto importa o SDK oficial `@owlbear-rodeo/sdk` na versão fixada **3.1.0** por jsDelivr. Não há etapa de build: os arquivos são estáticos e o GitHub Pages publica a raiz.

## Segurança e concorrência

A extensão usa uma concessão temporária em metadados da cena, anúncios de concorrência via `OBR.broadcast` e um marcador namespaced no item original. A restauração só ocorre se o marcador pertencer ao disparo e a imagem ainda for a imagem temporária esperada. Se o usuário modificar a imagem durante os quatro segundos, a extensão não sobrescreve essa alteração.

A API do Owlbear não oferece uma operação compare-and-swap ou transação distribuída para reservar atomicamente um token entre jogadores. O protocolo de broadcast + concessão reduz conflitos, mas não constitui exclusão mútua matematicamente garantida diante de perda de mensagens ou concorrência extrema. Os outros clientes também recebem a ordem de restauração como redundância; a permissão efetiva do Owlbear continua prevalecendo.

O temporizador principal fica na página de background da extensão, fora do popover. Se a extensão for desativada por completo ou todos os clientes que possam restaurar perderem conexão antes do fim da animação, nenhuma extensão web pode garantir uma restauração remota sem um processo ativo e autorizado. A chave de concessão expira automaticamente.

## Testes locais

Requer Node.js 20 ou superior. Não é necessário instalar dependências.

- `npm run check`: sintaxe JavaScript e verificações do manifesto/arquivos.
- `npm test`: testes unitários das regras de seleção, arbitragem e restauração segura.

Os testes unitários e estáticos não substituem o teste prático dentro de uma sala real do Owlbear Rodeo.

## Áudio

A fonte e a licença do som estão documentadas em [AUDIO-CREDITS.md](./AUDIO-CREDITS.md). O recurso é CC0 1.0.
