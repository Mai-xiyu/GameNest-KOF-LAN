function gameRequestHeaders(req) {
  const headers = { ...req.headers };
  for (const key of Object.keys(headers)) {
    if (key === 'cookie' || key === 'authorization' || key === 'proxy-authorization' ||
        key === 'forwarded' || key.startsWith('x-forwarded-') || key.startsWith('x-gamenest-')) {
      delete headers[key];
    }
  }
  return headers;
}

function gameResponseHeaders(headers) {
  const forwarded = { ...headers };
  delete forwarded['set-cookie'];
  return forwarded;
}

module.exports = { gameRequestHeaders, gameResponseHeaders };
