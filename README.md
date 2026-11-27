# Token Dinâmico · Owlbear Rodeo

Extensão para alternar imagens de um personagem conforme seu estado, com poses transitórias de **4 segundos**.

## Instalação

Adicione este manifesto no Owlbear Rodeo:

https://onze1onze.github.io/Token-Dinamico-Owlbear/manifest.json

## Uso

1. Selecione um token da camada **Personagens** e clique em **Vincular seleção**.
2. Em **Estados**, cadastre as poses permanentes. O primeiro estado será o inicial.
3. Em **Transições**, escolha origem, destino e imagem intermediária.
4. Em **Ataques**, associe uma pose de ataque ao estado da arma.
5. Execute as ações na área **Ações disponíveis**.

Uma transição mostra a imagem intermediária por 4 segundos e aplica o estado final. Um ataque volta ao mesmo estado da arma. Use imagens com o mesmo enquadramento para manter o personagem alinhado.

## Funcionamento

A extensão altera a imagem do próprio item, sem criar outro token. Posição, rotação e tamanho aparente são preservados. A configuração fica no metadata do token; o vínculo fica salvo no perfil local do jogador. O serviço recupera transições pendentes após reconexões e evita substituir uma edição manual feita durante a animação.

A configuração é exclusiva do Mestre. Executar ações exige permissão para atualizar personagens.

## Verificação

Com Node.js 20 ou superior:

- \`npm run check\`
- \`npm test\`

O GitHub Actions executa as mesmas verificações antes de publicar no GitHub Pages.
