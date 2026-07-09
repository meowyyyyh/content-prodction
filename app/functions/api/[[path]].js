export async function onRequest(context) {
  const url = new URL(context.request.url)
  const target = `https://content-prodction.onrender.com${url.pathname}${url.search}`
  const init = {
    method: context.request.method,
    headers: context.request.headers,
  }
  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    init.body = await context.request.text()
  }
  return fetch(target, init)
}
