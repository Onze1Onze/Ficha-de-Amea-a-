# Sistema Ameaça · Disparo para Owlbear Rodeo

Extensão para selecionar um personagem e um alvo na cena, além de escolher um token de animação diretamente da biblioteca de personagens do Owlbear Rodeo. O recurso da biblioteca é somente lido; ele não precisa estar colocado na mesa e não é adicionado à cena.

## Instalação

Manifesto para instalação no Owlbear Rodeo:

https://onze1onze.github.io/Ficha-de-Amea-a-/manifest.json

O endereço depende da ativação do GitHub Pages para este repositório. O workflow .github/workflows/pages.yml publica a raiz do projeto quando a opção GitHub Actions está habilitada em Settings → Pages.

## Uso

1. Adicione a extensão ao perfil do Owlbear Rodeo pelo endereço do manifesto.
2. Ative a extensão na sala.
3. Selecione o personagem e o alvo que já estão na cena.
4. Clique em ESCOLHER DA BIBLIOTECA e escolha um token na biblioteca de personagens.
5. Pressione DISPARAR.

## Sequência do disparo

- No instante do clique, a aparência do personagem na cena é substituída pela imagem escolhida na biblioteca.
- 1.000 ms depois da troca, o efeito sonoro local de tiro é reproduzido.
- 3.000 ms depois do som, a aparência original é restaurada. Portanto, a restauração acontece exatamente 4.000 ms após a troca visual.

A operação mantém o mesmo item e altera somente a imagem temporária e uma chave namespaced em metadata. O alvo não é alterado. O token selecionado na biblioteca nunca é colocado na mesa, removido ou modificado.

## Arquitetura

- manifest.json: manifesto do Owlbear Rodeo.
- index.html, style.css, src/main.js: painel compacto e seleção do token de animação pela API oficial de biblioteca OBR.assets.downloadImages.
- background.html, src/background.js: controlador persistente dos temporizadores, áudio e restauração.
- src/shot-engine.js: regras de seleção, tempos e restauração segura.
- audio/shotgun-20-gauge.mp3: efeito sonoro local.
- .github/workflows/pages.yml: publicação estática no GitHub Pages.

O projeto usa o SDK oficial @owlbear-rodeo/sdk na versão 3.1.0. Não há etapa de build: os arquivos são estáticos e o GitHub Pages publica a raiz.

## Segurança e concorrência

A extensão usa uma concessão temporária em metadados da cena, anúncios de concorrência via OBR.broadcast e um marcador namespaced no item original. A restauração só ocorre se o marcador pertencer ao disparo e a imagem ainda for a imagem temporária esperada. Se o usuário modificar a imagem durante os quatro segundos, a extensão não sobrescreve essa alteração.

A API do Owlbear não oferece uma operação compare-and-swap ou transação distribuída para reservar atomicamente um token entre jogadores. O protocolo de broadcast + concessão reduz conflitos, mas não constitui exclusão mútua matematicamente garantida diante de perda de mensagens ou concorrência extrema. Os outros clientes também recebem a ordem de restauração como redundância; a permissão efetiva do Owlbear continua prevalecendo.

O temporizador principal fica na página de background da extensão, fora do popover. Se a extensão for desativada por completo ou todos os clientes que possam restaurar perderem conexão antes do fim da animação, nenhuma extensão web pode garantir uma restauração remota sem um processo ativo e autorizado. A chave de concessão expira automaticamente.

## Testes locais

Requer Node.js 20 ou superior. Não é necessário instalar dependências.

- npm run check: sintaxe JavaScript e verificações do manifesto/arquivos.
- npm test: testes unitários dos tempos, origem do token de animação, arbitragem e restauração segura.

Os testes unitários e estáticos não substituem o teste prático dentro de uma sala real do Owlbear Rodeo.

## Áudio

A fonte e a licença do som estão documentadas em AUDIO-CREDITS.md. O recurso é CC0 1.0.