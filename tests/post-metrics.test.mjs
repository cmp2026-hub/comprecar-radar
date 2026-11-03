import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot } from '../src/cloud-state.mjs';
import { metricKey } from '../src/audience.mjs';
import { postsSignature } from '../public/update-policy.mjs';

const at = '2026-10-29T17:00:00Z', now = Date.parse('2026-10-29T19:00:00Z');
const urls = {
  facebook: 'https://www.facebook.com/reel/1884847382873669/',
  instagram: 'https://www.instagram.com/reel/Example/',
  tiktok: 'https://www.tiktok.com/@comprecartv/video/7702097122786561298',
  youtube: 'https://www.youtube.com/watch?v=abcdefghijk'
};
function fixture() {
  const posts = Object.entries(urls).map(([network, url]) => ({
    id: network, network, url, title: 'Contagens diferentes do mesmo vídeo em cada rede',
    kind: 'video', publishedAt: at, groupOverride: 'manual-verified',
    metrics: { value: 999999, metric: 'views', observedAt: at }
  }));
  const videos = Object.fromEntries(posts.map((p, i) => [metricKey(p.network, p.url), {
    network: p.network, url: p.url, value: (i + 1) * 111,
    metric: p.network === 'tiktok' ? 'plays' : 'views', observedAt: at,
    samples: [{ at, value: (i + 1) * 111, metric: p.network === 'tiktok' ? 'plays' : 'views' }],
    private: 'PRIVATE_METRIC_MARKER'
  }]));
  return { posts, lastCheck: at, audience: { startedAt: at, profiles: {}, videos, statuses: {} } };
}
const byNetwork = (built, n) => built.publicState.posts.find(p => p.network === n);

test('exporta a contagem própria de cada link nos posts e nos grupos, sem somar redes', () => {
  const input = fixture(), before = structuredClone(input), built = snapshot(input, now);
  for (const [i, network] of Object.keys(urls).entries()) {
    const expected = { value: (i + 1) * 111, metric: network === 'tiktok' ? 'plays' : 'views', observedAt: at };
    assert.deepEqual(byNetwork(built, network).metrics, expected);
    assert.deepEqual(built.publicState.groups[0].posts.find(p => p.network === network).metrics, expected);
  }
  assert.deepEqual(input, before);
  assert.ok(!JSON.stringify(built.publicState).includes('PRIVATE_METRIC_MARKER'));
  assert.ok(!JSON.stringify(built.publicState).includes('samples'));
  assert.equal(byNetwork(built, 'tiktok').url, urls.tiktok);
});

test('uma contagem ausente permanece desconhecida e zero medido continua sendo zero', () => {
  const input = fixture();
  delete input.audience.videos[metricKey('instagram', urls.instagram)];
  input.audience.videos[metricKey('facebook', urls.facebook)].value = 0;
  const built = snapshot(input, now);
  assert.equal(byNetwork(built, 'instagram').metrics, null);
  assert.equal(byNetwork(built, 'facebook').metrics.value, 0);
});

test('rejeita contagens inválidas, unidades desconhecidas, leituras sem data e métricas de fotos', () => {
  for (const patch of [{ value: -1 }, { value: '10' }, { value: Number.MAX_SAFE_INTEGER + 1 }, { metric: 'likes' }, { observedAt: null }]) {
    const input = fixture();
    Object.assign(input.audience.videos[metricKey('instagram', urls.instagram)], patch);
    assert.equal(byNetwork(snapshot(input, now), 'instagram').metrics, null);
  }
  const image = fixture();
  image.posts.find(p => p.network === 'instagram').kind = 'image';
  assert.equal(byNetwork(snapshot(image, now), 'instagram').metrics, null);
});

test('associa aliases legítimos do Instagram sem emprestar a contagem de outro post', () => {
  const input = fixture(), post = input.posts.find(p => p.network === 'instagram');
  post.url = 'https://www.instagram.com/p/Example/';
  assert.equal(byNetwork(snapshot(input, now), 'instagram').metrics.value, 222);
  post.url = 'https://www.instagram.com/reel/AnotherPost/';
  assert.equal(byNetwork(snapshot(input, now), 'instagram').metrics, null);
});

test('mudanças individuais publicam e atualizam os cards mesmo sem alterar a soma geral', () => {
  const first = fixture(), second = structuredClone(first);
  second.audience.videos[metricKey('facebook', urls.facebook)].value++;
  second.audience.videos[metricKey('instagram', urls.instagram)].value--;
  const a = snapshot(first, now), b = snapshot(second, now);
  assert.equal(a.reports.reports[0].views.value, b.reports.reports[0].views.value);
  assert.notEqual(a.signature, b.signature);
  assert.notEqual(postsSignature(a.publicState), postsSignature(b.publicState));
});

test('uma nova consulta com os mesmos valores preserva a política de publicação sob demanda', () => {
  const first = fixture(), second = structuredClone(first);
  for (const metric of Object.values(second.audience.videos)) metric.observedAt = '2026-10-29T18:00:00Z';
  const a = snapshot(first, now), b = snapshot(second, now);
  assert.equal(a.signature, b.signature);
  assert.notEqual(byNetwork(a, 'facebook').metrics.observedAt, byNetwork(b, 'facebook').metrics.observedAt);
});

test('mudanças entre visualizações e reproduções atualizam a publicação sem misturar as unidades', () => {
  const first = fixture(), second = structuredClone(first);
  second.audience.videos[metricKey('instagram', urls.instagram)].metric = 'plays';
  const a = snapshot(first, now), b = snapshot(second, now);
  assert.equal(byNetwork(b, 'instagram').metrics.metric, 'plays');
  assert.notEqual(a.signature, b.signature);
});
