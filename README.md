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

- No instante da troca visual, a aparência do personagem na cena é substituída pela imagem escolhida na biblioteca.
- 1.000 ms depois, o efeito sonoro local de tiro é reproduzido.
- 450 ms depois do início do som do disparo (1.450 ms após a troca visual), o som de um estojo de latão quicando em uma superfície de aço é reproduzido, com um timbre metálico mais agudo e pequenas batidas ressonantes sucessivas (efeito “pim-pirim”). O som dura aproximadamente 1,1 segundo.
- A aparência original é restaurada em 4.000 ms após a troca visual. O som do cartucho termina antes da restauração.

A operação mantém o mesmo item e altera somente a URL e o MIME da imagem, além de uma chave namespaced em metadata. O alvo não é alterado. O token selecionado na biblioteca nunca é colocado na mesa, removido ou modificado.

## Arquitetura

- manifest.json: manifesto do Owlbear Rodeo.
- index.html, style.css, src/main.js: painel compacto e seleção do token de animação pela API oficial OBR.assets.downloadImages.
- background.html, src/background.js: controlador dos temporizadores, áudio, restauração e recuperação de marcadores pendentes.
- src/shot-engine.js: regras de seleção, cronograma, validação, arbitragem e restauração segura.
- audio/shotgun-20-gauge.mp3: efeito sonoro local do disparo.
- Efeito de estojo: Steel Floor Bullet Casing 06, MP3 CC0 baixado durante a publicação e incluído no artefato do GitHub Pages. O runtime reproduz o arquivo local, sem hotlink externo nem requisição à SFXMint durante a partida.
- src/audio-player.js: criação e pré-carregamento dos reprodutores, reinício seguro e controle de volume.
- scripts/prepare-audio.js: aquisição do arquivo CC0 antes da validação e publicação.
- .github/workflows/pages.yml: validação e publicação estática no GitHub Pages.

O projeto usa o SDK oficial @owlbear-rodeo/sdk na versão 3.1.0. Não há compilação de frontend: o workflow baixa e valida o MP3 CC0 do estojo, executa os testes e publica os arquivos estáticos e o áudio local no GitHub Pages.

Para executar a validação local, use Node.js 20 ou superior, rode `npm run prepare:audio` (requer internet na primeira execução), depois `npm run check` e `npm test`.

## Segurança, concorrência e recuperação

A extensão usa uma concessão temporária em metadados da cena, anúncios de concorrência via OBR.broadcast e um marcador namespaced no próprio personagem. A concessão expira automaticamente. A arbitragem reduz conflitos entre jogadores, mas não é uma transação distribuída: a API do Owlbear não oferece compare-and-swap para reservar atomicamente um token entre clientes.

A restauração relê o item imediatamente antes de atualizá-lo e só troca URL/MIME de volta se o marcador ainda pertencer ao disparo e a imagem temporária continuar aplicada. Se o usuário modificar a aparência durante a animação, essa alteração é preservada e o marcador é removido sem sobrescrever a edição.

O marcador guarda os horários do disparo. Se o background for reiniciado, a extensão pode reconstruir os temporizadores a partir dos metadados da cena e concluir a restauração quando voltar a estar ativa. Os clientes também observam alterações nos itens da cena, o que fornece uma via adicional de recuperação caso a mensagem de sincronização não chegue.

Se todos os clientes com a extensão forem fechados ou desconectados, a restauração não pode ocorrer enquanto não houver um processo ativo e autorizado. A recuperação acontece quando a extensão volta a executar e a cena é carregada.

## Testes

Requer Node.js 20 ou superior. Não é necessário instalar dependências.

- npm run prepare:audio: baixa o efeito CC0 e verifica MIME, tamanho e quadros MPEG antes de colocá-lo em `audio/`.
- npm run check: sintaxe JavaScript, versão 1.0.1, manifesto, permissões, arquivos, integridade estrutural dos MP3, URLs e ordem de publicação.
- npm test: testes unitários de cronograma, seleção, recuperação, restauração, concorrência, preparação dos reprodutores, reinício de áudio, volume e validação dos dados MP3.

Os testes automatizados não substituem um teste prático dentro de uma sala real do Owlbear Rodeo com múltiplos jogadores, permissões distintas e reprodução de áudio habilitada.

## Áudio

A fonte e a licença do som estão documentadas em AUDIO-CREDITS.md. O recurso é CC0 1.0.
