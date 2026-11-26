# Créditos dos efeitos sonoros

## Disparo

Arquivo incorporado: `audio/shotgun-20-gauge.mp3`

- Nome da gravação: **20 gauge shotgun gunshot**
- Autor: **michorvath**
- Fonte original: https://freesound.org/people/michorvath/sounds/427595/
- Arquivo original: https://cdn.freesound.org/previews/427/427595_3094998-hq.mp3
- Licença: **Creative Commons Zero 1.0 Universal (CC0 1.0)**
- Texto da licença: https://creativecommons.org/publicdomain/zero/1.0/
- SHA-256 do arquivo MP3 original: `97a8f4893b910e3f43f3ccfcc5ea872af1da917937346f14b4114a74f1974c46`

O áudio de disparo é armazenado localmente no repositório e reproduzido sem requisições ao Freesound durante a partida.

## Estojo de cartucho caindo

- Nome: **Steel Floor Bullet Casing 06**
- Descrição: estojo de latão quicando em uma superfície de aço, com um timbre metálico ressonante e pequenas batidas rápidas sucessivas.
- Autor/provedor: **SFXMint**
- Página de origem: https://sfxmint.com/sounds/bullet-casing-06
- Arquivo reproduzido pelo navegador: https://sfxmint.com/dl/bullet-casing-06.mp3
- Duração aproximada: **1,1 segundo**
- Licença: **Creative Commons Zero 1.0 (CC0 1.0)**
- Licença e condições: https://sfxmint.com/license
- A SFXMint declara uso livre em jogos, aplicativos e projetos comerciais, sem atribuição obrigatória, e permite explicitamente hotlink do arquivo.

O serviço cria um elemento de áudio do navegador, define `preload="auto"` e chama `load()` assim que o background inicia. Antes de iniciar a animação do disparo, aguarda os dois efeitos atingirem o estado `canplay`; se o carregamento falhar ou exceder o tempo limite, o disparo é recusado sem trocar a aparência do personagem. A documentação da SFXMint permite hotlink dos MP3s e informa que a reprodução por navegador não conta como download. A página de origem e a licença CC0 são mantidas aqui para rastreabilidade.
