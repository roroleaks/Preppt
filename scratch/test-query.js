async function test() {
  const q = '(endometriosis OR medical OR management OR fertility) AND ("endometrioma" OR "assisted reproductive technology" OR "ovarian reserve" OR "Endometriosis" OR "Fertility Preservation") AND (PUB_YEAR:[2020 TO 2026])';
  const url = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=' + encodeURIComponent(q) + '&format=json&pageSize=5';
  const res = await fetch(url);
  const d = await res.json();
  console.log('Hits:', d.hitCount);
  d.resultList?.result?.forEach(p => console.log(' -', p.title, `(${p.pubYear})`));
}
test();
