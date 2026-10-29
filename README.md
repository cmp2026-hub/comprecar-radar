# Comprecar Radar — hospedagem independente

Versão preparada para publicar em uma conta própria do GitHub, sem servidor local, túnel temporário ou Codex em execução. **Este pacote ainda precisa ser publicado e ter a primeira coleta na nuvem verificada.** O endereço definitivo será informado pelo GitHub após a ativação; normalmente terá o formato `https://SEUUSUARIO.github.io/comprecar-radar/`.

## O que está incluído

- Painel atual, com links agrupados, busca, sete períodos, seguidores e visualizações equivalentes ao período escolhido.
- Histórico público já coletado e os agrupamentos corrigidos manualmente, incluindo o Instagram da publicação sobre corrente elétrica.
- Botões de copiar e compartilhar no WhatsApp. O visitante escolhe a conversa e confirma o envio.
- Coletor executado pelo GitHub Actions a cada quinze minutos, nos minutos 7, 22, 37 e 52 de cada hora. O navegador verifica dados a cada cinco minutos enquanto está visível.
- Publicação quando os links, contadores ou a disponibilidade mudam, com uma renovação de status pelo menos a cada hora.
- Estado entre execuções no cache do GitHub e checkpoint diário versionado no repositório, para preservar o histórico mesmo após expiração do cache.

## Ativação

1. Crie sua conta gratuita em [github.com/signup](https://github.com/signup). O nome escolhido fará parte do endereço do site.
2. Crie um repositório **público**, chamado `comprecar-radar`. O plano gratuito do GitHub Pages utiliza código público. Não coloque senhas, tokens, cookies ou números privados no projeto.
3. Publique os arquivos desta pasta na raiz do repositório, incluindo `.github/workflows/publicar.yml`. As pastas `.cache` e `site` são locais e não precisam ser enviadas.
4. Em **Settings → Pages → Build and deployment → Source**, escolha **GitHub Actions**.
5. Em **Actions → Atualizar e publicar o Comprecar Radar**, execute **Run workflow**. Aguarde o resultado e abra o endereço indicado em **Settings → Pages**.
6. Confira uma publicação recente, os quatro links do conteúdo sobre corrente elétrica e as contagens nos filtros Diária e 7 dias. Confira também o resultado das fontes na primeira execução; uma página publicada não confirma que todas as redes aceitaram o acesso do servidor.

Se o envio for feito por Git, inicialize o repositório nesta pasta e adicione apenas `.github`, `src`, `public`, `scripts`, `tests`, `data`, `README.md`, `.gitignore` e `package.json`. Configure o repositório remoto da conta que acabou de criar e envie a branch `main`.

## Operação sem Codex

Depois de publicada e verificada a primeira execução, o site e a coleta dependem da conta e dos serviços do GitHub; este computador pode ficar desligado. Para solicitar uma coleta extra, use **Run workflow** no GitHub. O botão **Atualizar** do site consulta os últimos dados já publicados.

A antiga hospedagem local e suas tarefas ainda não foram desligadas. Desative-as somente depois de confirmar o novo endereço e a coleta hospedada. Nenhuma tarefa do Codex faz parte deste pacote.

As fontes são públicas e não usam login. Instagram, Facebook e TikTok podem limitar o acesso ou mudar o formato; nesses casos, os links e contadores anteriores são preservados e a cobertura permanece parcial. A verificação complementar feita por um navegador no Codex não foi transformada em uma garantia de coleta automática. Não há contorno de CAPTCHA ou autenticação, nem integração oficial administrativa nova.

Para fixar outro agrupamento de publicações **já coletadas**, edite `data/groups.json` na sua conta, usando objetos no formato `{ "urls": ["LINK_EXISTENTE_1", "LINK_EXISTENTE_2"] }`. A rotina rejeita links desconhecidos, formatos incompatíveis e duas publicações da mesma rede no mesmo grupo. As legendas e datas originais são mantidas.

## Verificação local opcional

Com Node.js 24 ou superior, execute `npm test`, `npm run build` e `npm run preview`. A prévia abre em `http://127.0.0.1:4320/comprecar-radar/`. O build local reaproveita as contagens salvas e não consulta as redes. A hospedagem definitiva não depende dessa prévia.

## Custos e limites

GitHub Pages e executores padrão do GitHub Actions são gratuitos para repositórios públicos, dentro dos limites do serviço. O endereço `github.io` é um subdomínio gratuito do provedor, não um domínio `.com.br` registrado. Não é necessário registrar outro domínio para usar esse endereço.

Execuções agendadas podem atrasar. O GitHub pode desativar agendamentos em repositórios públicos sem atividade por sessenta dias; os checkpoints diários deste projeto são gravações reais de dados, mas o responsável deve acompanhar eventuais falhas na aba Actions. O plano gratuito não é uma promessa de atualização segundo a segundo nem de disponibilidade sem limites.

Referências: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [publicação com Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [limites](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits), [agendamentos](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
