const zlib = require('zlib');
const http = require('http');
const https = require('https');
const StackTrace = require('stacktrace-js');

const initTime = process.hrtime();

// DT requires us to use relative time in a strange format (xxx.xxx)
const getTime = () => {
  const diff = process.hrtime(initTime);

  return diff[0] + diff[1] / 1e9;
};

const formatRequestHeaders = req =>
  Object.keys(req.headers).reduce((acc, k) => {
    if (typeof req.headers[k] === 'string') acc[k] = req.headers[k];
    return acc;
  }, {});

const formatResponseHeaders = res =>
  Object.keys(res.headers).reduce((acc, k) => {
    if (typeof res.headers[k] === 'string') acc[k] = res.headers[k];
    return acc;
  }, {});

const getMineType = mimeType => {
  // nasty hack for ASF
  if (mimeType === 'OPENJSON') {
    return 'application/json;charset=UTF-8';
  }

  return mimeType;
}

const cacheRequests = {};
let id = 1;
const getId = () => id++;

const callbackWrapper = (callback, req, initiator) => res => {

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
      initiator,
      wallTime: Date.now(),
      type: 'Document'
    },
    type: 'Network.requestWillBeSent'
  });

  const encoding = res.headers['content-encoding'];
  let rawData = [];

  const onEnd = function() {
    rawData = Buffer.concat(rawData);
    rawData = rawData.toString('base64');

    cacheRequests[res.req.__requestId] = { ...res, __rawData: rawData, base64Encoded: true };
    const payload = {
      id: res.req.__requestId,
      requestId: res.req.__requestId,
      loaderId: res.req.__requestId,
      base64Encoded: true,
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
        mimeType: getMineType(res.headers['content-encoding'] || res.headers['content-type']),
        requestHeaders: formatRequestHeaders(req)
      }
    };

    // Send the response back.
    process.send({ payload: payload, type: 'Network.responseReceived' });
    process.send({ payload: payload, type: 'Network.loadingFinished' });
  };

  if (encoding === 'gzip' || encoding === 'x-gzip') {
    const gunzip = zlib.createGunzip();
    res.pipe(gunzip);

    gunzip.on('data', function(data) {
      rawData.push(data);
    });
    gunzip.on('end', onEnd);
  } else {
    res.on('data', chunk => {
      rawData.push(chunk);
    });
    res.on('end', onEnd);
  }

  callback && callback(res);
};

const PayPalBlackBoxScript = [
  '/servicecore/',
  '/levee/',
  '/servicecore-hystrix/',
  '/async/'
];

const originHTTPRequest = http.request;
http.request = function wrapMethodRequest(req, callback) {

  const initiator = {
    type: 'script',
    stack: {
      callFrames: StackTrace.getSync().slice(1).filter(e => e.getFileName().indexOf('node_modules') === -1).map(e => ({
        columnNumber: e.getColumnNumber(),
        functionName: e.getFunctionName(),
        lineNumber: e.getLineNumber(),
        scriptId: e.getFileName(),
        url: `file:///${e.getFileName()}`
      }))
    }
  };

  const request = originHTTPRequest.call(this, req, callbackWrapper(callback, req, initiator));
  return request;
};

const originHTTPSRequest = https.request;
https.request = function wrapMethodRequest(req, callback) {

  const initiator = {
    type: 'script',
    stack: {
      callFrames: StackTrace.getSync().slice(1).filter(e => e.getFileName().indexOf('node_modules') === -1).map(e => ({
        columnNumber: e.getColumnNumber(),
        functionName: e.getFunctionName(),
        lineNumber: e.getLineNumber(),
        scriptId: e.getFileName(),
        url: `file:///${e.getFileName()}`
      }))
    }
  };

  const request = originHTTPSRequest.call(this, req, callbackWrapper(callback, req, initiator));
  return request;
};

