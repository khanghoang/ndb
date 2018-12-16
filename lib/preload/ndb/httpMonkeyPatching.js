const zlib = require('zlib');

const initTime = process.hrtime();

// DT requires us to use relative time in a strange format (xxx.xxx)
const getTime = () => {
  const diff = process.hrtime(initTime);

  return diff[0] + diff[1] / 1e9;
};

const http = require('http');

const cacheRequests = {};
let id = 1;
const getId = () => id++;

const originalRequest = http.request;

const callbackWrapper = (callback, req) => res => {

  const { statusCode } = res;
  const contentType = res.headers['content-type'];
  const encoding = res.headers['content-encoding'];

  let error;
  if (statusCode !== 200) {
    error = new Error('Request Failed.\n' +
      `Status Code: ${statusCode}`);
  } else if (!/^application\/json/.test(contentType)) {
    error = new Error('Invalid content-type.\n' +
      `Expected application/json but received ${contentType}`);
  }
  if (error) {
    console.error(error.message);
    // consume response data to free up memory
    res.resume();
    return;
  }

  let rawData = '';

  if (encoding === 'gzip' || encoding === 'x-gzip') {
    const gunzip = zlib.createGunzip();
    res.pipe(gunzip);

    gunzip.on('data', function(data) {
      rawData += data.toString();
    }).on('end', function() {
      cacheRequests[res.req.__requestId] = { ...res, __rawData: rawData };

      // set-cookie prop in the header has value as an array
      // for example: ["__cfduid=dbfe006ef71658bf4dba321343c227f9a15449556…20:29 GMT; path=/; domain=.typicode.com; HttpOnly"]
      const newResponseHeaders = Object.keys(res.headers).reduce((acc, k) => {
        if (typeof res.headers[k] === 'string') acc[k] = res.headers[k];
        return acc;
      }, {});

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
          headers: newResponseHeaders,
          mimeType: res.headers['content-type'],
          requestHeaders: req.headers
        }
      };

      // Send the response back.
      process.send({ payload: payload, type: 'responseReceived' });
      process.send({ payload: payload, type: 'loadingFinished' });
    }).on('error', function(e) {
      throw e;
    });
  }

  callback && callback(res);
};

http.request = function wrapMethodRequest(req, callback) {
  process.send({ payload: req, type: 'requestWillBeSent' });
  // do something with the req here
  // ...
  // call the original 'request' function
  const request = originalRequest.call(this, req, callbackWrapper(callback, req));
  request.__requestId = getId();

  // Remove req from response to avoid circular dependency.
  return request;
};

