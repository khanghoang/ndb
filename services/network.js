const { rpc, rpc_process } = require('carlo/rpc');
const http = require('http');

class NetworkBackend {
  constructor(frontend) {
    require('../lib/process_utility.js')('network', () => this.dispose());
    this._frontend = frontend;
  }

  async init(frontend) {
    this._frontend = frontend;
  }

  send(method, data) {
    this._frontend.send(method, data);
  }

  dispose() {
    Promise.resolve().then(() => process.exit(0));
  }
}

rpc_process.init(frontend => rpc.handle(new NetworkBackend(frontend)));

