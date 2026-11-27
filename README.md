# Token Dinâmico · Owlbear Rodeo

Extensão do Owlbear Rodeo para transformar um token de personagem em um conjunto de estados permanentes, transições animadas e poses de ataque. A imagem intermediária permanece por **4.000 ms**, contados a partir do início da atualização na cena; ao final, o mesmo item recebe a imagem do estado de destino.

## Instalação

Adicione a extensão ao Owlbear Rodeo usando o manifesto publicado:

`https://onze1onze.github.io/Token-Dinamico-Owlbear/manifest.json`

O repositório publica a raiz pelo GitHub Pages usando GitHub Actions. Em Settings → Pages, a origem deve estar configurada como GitHub Actions.

## Configuração

1. Coloque na cena o token base do personagem.
2. Selecione somente esse token e abra Token Dinâmico no menu de extensões.
3. Clique em **Vincular token selecionado**. O vínculo fica salvo no perfil local do jogador para que não seja necessário repetir a seleção sempre que o painel for reaberto.
4. Em Estados do personagem, escolha a imagem Idle e salve-a. O primeiro estado salvo torna-se o Idle inicial e sua imagem é aplicada ao token.
5. Adicione os outros estados permanentes, por exemplo `Idle Pistola`, `Idle Escopeta`, `Idle Faca` e `Máscara Colocada`.
6. Cadastre ações de transição com a origem, o estado final e a imagem transitória.
7. Cadastre ações de ataque vinculadas ao estado da arma. O ataque usa a imagem transitória e retorna à mesma aparência de arma ao final dos 4 segundos.

A escolha das imagens abre o seletor nativo da biblioteca de personagens do Owlbear. A extensão não adiciona as imagens usadas na animação como novos tokens na cena. Use imagens com o mesmo tamanho de canvas e o mesmo enquadramento entre Idle, transições e ataques para evitar que a figura pareça mudar de tamanho ou posição durante a troca.

## Exemplos

| Ação | Origem | Pose transitória | Destino |
|---|---|---|---|
| Colocar máscara | Idle | Pegando máscara / colocando | Máscara Colocada |
| Pegar pistola | Idle | Pegando pistola | Idle Pistola |
| Pegar escopeta | Idle | Pegando escopeta | Idle Escopeta |
| Pegar faca | Idle | Pegando faca | Idle Faca |
| Trocar escopeta por pistola | Idle Escopeta | Guardando escopeta e pegando pistola | Idle Pistola |
| Disparar pistola | Idle Pistola | Atirando | Idle Pistola |
| Disparar escopeta | Idle Escopeta | Atirando com escopeta | Idle Escopeta |

Ações como pegar uma arma podem usar `Qualquer estado` como origem. O estado final é sempre explícito. Ataques são configurados com origem e destino iguais, então o sistema retorna ao estado exato daquela arma, sem depender de uma imagem base genérica.

## Como funciona

- `src/main.js` apresenta a interface, vincula o token selecionado, abre a biblioteca de imagens e grava a configuração no metadata do próprio token.
- `src/background.js` recebe as ações, valida o estado, arbitra comandos simultâneos, atualiza a imagem e agenda a conclusão no instante `startedAt + 4000`.
- `src/engine.js` contém as regras puras de estados, validação, cronograma e preservação do tamanho visual do token.
- O marcador temporário é armazenado no metadata do token para que outra instância da extensão possa recuperar uma transição pendente se o serviço for reiniciado.
- A imagem é alterada no item existente com `OBR.scene.items.updateItems`; posição, rotação, escala, identificação, camada e demais propriedades do item são mantidas. A nova imagem usa as dimensões do recurso escolhido na biblioteca. Para poses perfeitamente alinhadas, use arquivos com o mesmo tamanho de tela/transparência e o mesmo enquadramento.
- Se o usuário alterar manualmente a imagem durante uma transição, a extensão não sobrescreve essa edição na conclusão.

## Permissões

A configuração de estados e ações é restrita ao Mestre. Executar ações exige permissão `CHARACTER_UPDATE` para jogadores; o Mestre sempre pode executar. A extensão não controla movimento, vida, inventário ou atributos do personagem.

## Testes locais

Requer Node.js 20 ou superior. O projeto não precisa de dependências externas para os testes:

- `npm run check`
- `npm test`

Os testes automatizados cobrem a duração, disponibilidade por estado, retorno do ataque, validação do marcador, proteção contra sobrescrever edição manual e arbitragem determinística. A publicação automática executa os mesmos testes.

A verificação automatizada não substitui um teste prático numa sala real, incluindo sincronização entre jogadores e permissões configuradas pela sala. A troca é solicitada no timestamp do início da atualização; como em qualquer aplicação distribuída, o tempo percebido em cada cliente também depende da propagação da atualização da cena.
