/**
 * @license Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */


try {
  const fs = require('fs');
  const inspector = require('inspector');
  const url = require('url');
  const zlib = require("zlib");

  process.versions['ndb'] = process.env.NDB_VERSION;

  const http = require('http');
  const originalRequest = http.request;

  console.log('Preload JS | patch the request http');

  const callbackWrapper = (callback) => (res) => {

    const { statusCode } = res;
    const contentType = res.headers['content-type'];
    const encoding = res.headers['content-encoding'];
    // const PassThrough = Stream.PassThrough;
    // let body = res.pipe(new PassThrough());
    // const headers = createHeadersLenient(res.headers);


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

    // res.setEncoding('utf8');
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
      try {

        if(encoding === 'gzip' || encoding === 'x-gzip') {
          // body = body.pipe(zlib.createGunzip(zlibOptions));
          // response = new Response(body, response_options);
          // resolve(response);
          // return;

          const gunzip = zlib.createGunzip();            
          res.pipe(gunzip);

          gunzip.on('data', function(data) {
              // decompression chunk ready, add it to the buffer
              buffer.push(data.toString())

          }).on("end", function() {
              let data = buffer.join("");
              // response and decompression complete, join the buffer and return
              // callback(null, buffer.join("")); 

          }).on("error", function(e) {
              callback(e);
          })

        }
        console.log(res.req.data);        
        console.log(rawData)
        // const parsedData = JSON.parse(rawData);
        console.log(rawData.toString());
      } catch (e) {
        console.error(e.message);
      }
    });

    callback && callback(res);
  }

  http.request = function wrapMethodRequest(req, callback) {
    console.log(req.host, req.body);
    console.log('requestWillBeSent');
    console.log('req: ', req);
    process.send({ payload: req, type: 'requestWillBeSent' });
    // do something with the req here
    // ...
    // call the original 'request' function
    const request = originalRequest.call(this, req, callbackWrapper(callback));

    // request.on('response', res => {
    //   // console.log('JSON.stringify', JSON.stringify(res.toString()));
    //   // debugger;
    //   console.log('response received');
    //   console.log('res: ', res);

    //   // const props = [
    //   //   'time',
    //   //   'headers',
    //   //   'body'
    //   // ];

    //   // const newRes = pick(res, props);

    //   // Send the response back.
    //   if(res) {
    //     // process.send({ payload: newRes, type: 'responseReceived' });
    //     // process.send({ payload: res, type: 'responseReceived' });
    //     // process.send({ payload: JSON.stringify(res.toString()), type: 'responseReceived' });
    //     process.send({ payload: "rupesh", type: 'responseReceived'});
    //   }
    // });
    return request;
  };

  // store a reference to the original request function
  const nddStore = process.env.NDD_STORE;
  const nddParentProcessId = process.env.NDD_PPID;
  const nddData = process.env.NDD_DATA;
  const nddWaitForConnection = process.env.NDD_WAIT_FOR_CONNECTION;

  process.env.NDD_PPID = process.pid;
  process.once('exit', _ => fs.unlinkSync(stateFileName));
  process.breakAtStart = _ => {
    process._breakFirstLine = true;
    const commandLineAPIDebug = debug;
    process.binding('inspector').callAndPauseOnStart = (fn, receiver, ...args) => {
      commandLineAPIDebug(fn);
      return fn.apply(receiver, args);
    };
  };

  inspector.open(0, undefined, false);

  const inspectorUrl = url.parse(inspector.url());
  inspectorUrl.pathname = '/json';
  inspectorUrl.hash = '';
  inspectorUrl.protocol = 'http';
  inspectorUrl.search = '';
  const port = Number(inspectorUrl.port);
  const targetListUrl = url.format(inspectorUrl);

  const sep = process.platform === 'win32' ? '\\' : '/';
  const stateFileName = `${nddStore}${sep}${process.pid}`;
  fs.writeFileSync(stateFileName, JSON.stringify({
    targetListUrl: targetListUrl,
    ppid: nddParentProcessId,
    data: nddData,
    argv: process.argv.concat(process.execArgv),
    cwd: process.cwd()
  }));

  inspector.close();
  inspector.open(port, undefined, nddWaitForConnection !== '0');
  delete process.breakAtStart;
} catch (e) {
}
// eslint-disable-next-line spaced-comment
//# sourceURL=internal/preload.js
