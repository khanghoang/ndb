const http = require('http');

const cacheRequests = {};
let id = 1;
const getId = () => id++;

const zlib = require('zlib');

const originalRequest = http.request;

const callbackWrapper = callback => res => {

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

      const copyResponse = {};
      copyResponse.id = res.req.__requestId;
      copyResponse.data = cacheRequests[res.req.__requestId].__rawData;

      // Send the response back.
      process.send({ payload: copyResponse, type: 'responseReceived' });
      process.send({ payload: copyResponse, type: 'loadingFinished' });
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
  const request = originalRequest.call(this, req, callbackWrapper(callback));
  request.__requestId = getId();

  // Remove req from response to avoid circular dependency.
  return request;
};

