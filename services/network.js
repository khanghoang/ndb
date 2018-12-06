const { rpc, rpc_process } = require('carlo/rpc');
const http = require('http');

class NetworkBackend {
  constructor(frontend) {
    require('../lib/process_utility.js')('network', () => this.dispose());
    this._frontend = frontend;
    // override the function
    console.log('mock the http');

    http.request = function wrapMethodRequest(req) {
      console.log(req.host, req.body);
      // do something with the req here
      // ...
      // call the original 'request' function
      return originalRequest.apply(this, arguments);
    };
  }

  async init(frontend) {
    this._frontend = frontend;
  }

  dispose() {
    Promise.resolve().then(() => process.exit(0));
  }
}

rpc_process.init(frontend => rpc.handle(new NetworkBackend(frontend)));
