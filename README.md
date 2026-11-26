# Sistema Ameaça · Disparo para Owlbear Rodeo

Extensão para trocar temporariamente a aparência de um personagem da cena por um token escolhido diretamente na biblioteca de personagens do Owlbear Rodeo. O recurso da biblioteca é somente lido: não precisa estar colocado na mesa e não é adicionado à cena.

A extensão não possui seleção de alvo e não aplica efeitos visuais em outros tokens. O disparo altera exclusivamente a imagem do personagem selecionado.

## Instalação

Manifesto para instalação no Owlbear Rodeo:

https://onze1onze.github.io/Ficha-de-Amea-a-/manifest.json

O endereço depende da ativação do GitHub Pages para este repositório. O workflow `.github/workflows/pages.yml` publica a raiz do projeto quando a opção GitHub Actions está habilitada em Settings → Pages.

## Uso

1. Adicione a extensão ao perfil do Owlbear Rodeo pelo endereço do manifesto.
2. Ative a extensão na sala.
3. Selecione o personagem que realizará o disparo.
4. Clique em ESCOLHER DA BIBLIOTECA e escolha um token na biblioteca de personagens.
5. Pressione DISPARAR.

Não é necessário selecionar um alvo.

## Sequência do disparo

- No instante do disparo, somente a aparência do personagem selecionado é substituída pela imagem escolhida na biblioteca.
- 1.000 ms depois, o efeito sonoro local de tiro é reproduzido.
- 450 ms depois do início do som do disparo (1.450 ms após a troca visual), o som de um estojo de latão quicando em uma superfície de aço é reproduzido.
- A aparência original do personagem é restaurada em 4.000 ms após a troca visual.

Nenhum outro token é selecionado ou alterado, e nenhum efeito visual é criado, sincronizado ou aplicado a qualquer outro item da cena. Não existe shader, flash, onda de choque ou item EFFECT.

## Arquitetura

- `manifest.json`: manifesto do Owlbear Rodeo.
- `index.html`, `style.css`, `src/main.js`: painel compacto, seleção do personagem e escolha do token de animação pela API oficial `OBR.assets.downloadImages`.
- `background.html`, `src/background.js`: controlador dos temporizadores, áudio, restauração e recuperação de marcadores pendentes.
- `src/shot-engine.js`: validação do personagem e do recurso da biblioteca, cronograma, arbitragem e restauração segura.
- `audio/shotgun-20-gauge.mp3`: efeito sonoro local do disparo.
- Efeito de estojo: Steel Floor Bullet Casing 06, MP3 CC0 reproduzido por hotlink direto a partir do navegador.
- `src/audio-player.js`: criação e pré-carregamento dos reprodutores, espera por `canplay`, reinício seguro e controle de volume.
- `.github/workflows/pages.yml`: validação e publicação estática no GitHub Pages.

O projeto usa o SDK oficial `@owlbear-rodeo/sdk` na versão 3.1.0. Não há compilação de frontend: o GitHub Pages publica os arquivos estáticos, enquanto os efeitos sonoros são pré-carregados pelo navegador quando o serviço inicia.

## Segurança, concorrência e recuperação

A extensão usa uma concessão temporária em metadados da cena, anúncios de concorrência via `OBR.broadcast` e um marcador namespaced no próprio personagem. A concessão expira automaticamente. A arbitragem reduz conflitos entre jogadores, mas não é uma transação distribuída: a API do Owlbear não oferece compare-and-swap para reservar atomicamente um token entre clientes.

A restauração relê o personagem imediatamente antes de atualizá-lo e só troca URL/MIME de volta se o marcador ainda pertencer ao disparo e a imagem temporária continuar aplicada. Se o usuário modificar a aparência durante a animação, essa alteração é preservada e o marcador é removido sem sobrescrever a edição.

O marcador guarda os horários do disparo. Se o background for reiniciado, a extensão pode reconstruir os temporizadores a partir dos metadados da cena e concluir a restauração quando voltar a estar ativa. Os clientes também observam alterações nos itens da cena, o que fornece uma via adicional de recuperação caso a mensagem de sincronização não chegue.

Se todos os clientes com a extensão forem fechados ou desconectados, a restauração não pode ocorrer enquanto não houver um processo ativo e autorizado. A recuperação acontece quando a extensão volta a executar e a cena é carregada.

## Testes

Requer Node.js 20 ou superior. Não é necessário instalar dependências.

- `npm run check`: sintaxe JavaScript, versão 1.0.3, manifesto, permissões, URLs, SDK, áudio, ausência de seleção de alvo e ausência de código de efeitos visuais em outros tokens.
- `npm test`: testes unitários de cronograma, seleção exclusiva do personagem e token da biblioteca, recuperação, restauração, concorrência, preparação dos reprodutores e reprodução de áudio.

Os testes automatizados não substituem um teste prático dentro de uma sala real do Owlbear Rodeo com múltiplos jogadores, permissões distintas e reprodução de áudio habilitada.

## Áudio

A fonte e a licença do som estão documentadas em AUDIO-CREDITS.md. O recurso é CC0 1.0.
