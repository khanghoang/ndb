const zlib = require('zlib');

const initTime = process.hrtime();

// DT requires us to use relative time in a strange format (xxx.xxx)
const getTime = () => {
  const diff = process.hrtime(initTime);

  return diff[0] + diff[1] / 1e9;
};

const formatRequestHeaders = req =>
  Object.keys(req.headers).reduce((acc, k) => {
    acc[k] = req.headers[k][0];
    return acc;
  }, {});

const formatResponseHeaders = res =>
  Object.keys(res.headers).reduce((acc, k) => {
    if (typeof res.headers[k] === 'string') acc[k] = res.headers[k];
    return acc;
  }, {});

const http = require('http');

const cacheRequests = {};
let id = 1;
const getId = () => id++;

const originalRequest = http.request;

const callbackWrapper = (callback, req) => res => {

  const requestId = getId();
  res.req.__requestId = requestId;

  process.send({
    payload: {
      requestId: requestId,
      loaderId: requestId,
      documentURL: req.href,
      request: {
        url: req.href,
        method: req.method,
        headers: formatRequestHeaders(req),
        mixedContentType: 'none',
        initialPriority: 'VeryHigh',
        referrerPolicy: 'no-referrer-when-downgrade'
      },
      timestamp: getTime(),
      wallTime: Date.now(),
      initiator: {
        'type': 'other'
      },
      type: 'Document'
    },
    type: 'Network.requestWillBeSent'
  });

  const encoding = res.headers['content-encoding'];
  let rawData = '';

  if (encoding === 'gzip' || encoding === 'x-gzip') {
    const gunzip = zlib.createGunzip();
    res.pipe(gunzip);

    gunzip.on('data', function(data) {
      rawData += data.toString();
    }).on('end', function() {
      cacheRequests[res.req.__requestId] = { ...res, __rawData: rawData };
      const payload = {
        id: res.req.__requestId,
        requestId: res.req.__requestId,
        loaderId: res.req.__requestId,
        data: cacheRequests[res.req.__requestId].__rawData,
        timestamp: getTime(),
        type: 'XHR',
        encodedDataLength: 100,
        response: {
          url: req.href,
          status: res.statusCode,
          statusText: res.statusText,
          // set-cookie prop in the header has value as an array
          // for example: ["__cfduid=dbfe006ef71658bf4dba321343c227f9a15449556…20:29 GMT; path=/; domain=.typicode.com; HttpOnly"]
          headers: formatResponseHeaders(res),
          mimeType: res.headers['content-type'],
          requestHeaders: formatRequestHeaders(req)
        }
      };

      // Send the response back.
      process.send({ payload: payload, type: 'Network.responseReceived' });
      process.send({ payload: payload, type: 'Network.loadingFinished' });
    }).on('error', function(e) {
      throw e;
    });
  }

  callback && callback(res);
};

http.request = function wrapMethodRequest(req, callback) {
  const request = originalRequest.call(this, req, callbackWrapper(callback, req));
  return request;
};

