/**
 * @license Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */

let id = 1;

const getId = () => {
  return `${id++}`;
};

Ndb.nodeExecPath = function() {
  if (!Ndb._nodeExecPathPromise)
    Ndb._nodeExecPathPromise = Ndb.backend.which('node').then(result => result.resolvedPath);
  return Ndb._nodeExecPathPromise;
};

Ndb.processInfo = function() {
  if (!Ndb._processInfoPromise)
    Ndb._processInfoPromise = Ndb.backend.processInfo();
  return Ndb._processInfoPromise;
};

/**
 * @implements {Common.Runnable}
 */
Ndb.NdbMain = class extends Common.Object {
  /**
   * @override
   */
  async run() {
    InspectorFrontendAPI.setUseSoftMenu(true);
    document.title = 'ndb';
    Common.moduleSetting('blackboxInternalScripts').addChangeListener(Ndb.NdbMain._calculateBlackboxState);
    Ndb.NdbMain._calculateBlackboxState();

    const setting = Persistence.isolatedFileSystemManager.workspaceFolderExcludePatternSetting();
    setting.set(Ndb.NdbMain._defaultExcludePattern().join('|'));
    Ndb.nodeProcessManager = new Ndb.NodeProcessManager(SDK.targetManager);
    this._addDefaultFileSystem();

    await new Promise(resolve => {
      SDK.initMainConnection(() => {
        const type = Runtime.queryParam('v8only') ? SDK.Target.Type.Node : SDK.Target.Type.Frame;
        debugger;
        const target = SDK.targetManager.createTarget('main', Common.UIString('Main'), type, null);
        target.runtimeAgent().runIfWaitingForDebugger();
        new InspectorMain.InspectedNodeRevealer();
        new InspectorMain.SourcesPanelIndicator();
        new InspectorMain.BackendSettingsSync();
        new MobileThrottling.NetworkPanelIndicator();

        InspectorFrontendHost.events.addEventListener(InspectorFrontendHostAPI.Events.ReloadInspectedPage, event => {
          const hard = /** @type {boolean} */ (event.data);
          SDK.ResourceTreeModel.reloadAllPages(hard);
        });
        resolve();
      }, Components.TargetDetachedDialog.webSocketConnectionLost);

    });
    // Create root Main target.
    SDK.targetManager.createTarget('<root>', ls`Root`, SDK.Target.Type.Browser, null);

    this._repl();

    Runtime.experiments.setEnabled('timelineTracingJSProfile', false);
    if (Common.moduleSetting('autoStartMain').get()) {
      const main = await Ndb.mainConfiguration();
      if (main)
        Ndb.nodeProcessManager.debug(main.execPath, main.args);
    }
  }

  async _addDefaultFileSystem() {
    const info = await Ndb.processInfo();
    await Ndb.nodeProcessManager.addFileSystem(info.cwd);
  }

  async _repl() {
    const code = btoa(`console.log('Welcome to the ndb %cR%cE%cP%cL%c!',
      'color:#8bc34a', 'color:#ffc107', 'color:#ff5722', 'color:#2196f3', 'color:inherit');
      process.title = 'ndb/repl';
      setInterval(_ => 0, 2147483647)//# sourceURL=repl.js`);
    const args = ['-e', `eval(Buffer.from('${code}', 'base64').toString())`];
    const options = { ignoreOutput: true, data: 'ndb/repl' };
    const node = await Ndb.nodeExecPath();
    for (;;)
      await Ndb.nodeProcessManager.debug(node, args, options);
  }

  static _defaultExcludePattern() {
    const defaultCommonExcludedFolders = [
      '/bower_components/', '/\\.devtools', '/\\.git/', '/\\.sass-cache/', '/\\.hg/', '/\\.idea/',
      '/\\.svn/', '/\\.cache/', '/\\.project/'
    ];
    const defaultWinExcludedFolders = ['/Thumbs.db$', '/ehthumbs.db$', '/Desktop.ini$', '/\\$RECYCLE.BIN/'];
    const defaultMacExcludedFolders = [
      '/\\.DS_Store$', '/\\.Trashes$', '/\\.Spotlight-V100$', '/\\.AppleDouble$', '/\\.LSOverride$', '/Icon$',
      '/\\._.*$'
    ];
    const defaultLinuxExcludedFolders = ['/.*~$'];
    let defaultExcludedFolders = defaultCommonExcludedFolders;
    if (Host.isWin())
      defaultExcludedFolders = defaultExcludedFolders.concat(defaultWinExcludedFolders);
    else if (Host.isMac())
      defaultExcludedFolders = defaultExcludedFolders.concat(defaultMacExcludedFolders);
    else
      defaultExcludedFolders = defaultExcludedFolders.concat(defaultLinuxExcludedFolders);
    return defaultExcludedFolders;
  }

  static _calculateBlackboxState() {
    const blackboxInternalScripts = Common.moduleSetting('blackboxInternalScripts').get();
    const PATTERN = '^internal[\\/].*';
    const regexPatterns = Common.moduleSetting('skipStackFramesPattern').getAsArray()
        .filter(({pattern}) => pattern !== PATTERN && pattern !== '^internal/.*');
    if (blackboxInternalScripts)
      regexPatterns.push({pattern: PATTERN });
    Common.moduleSetting('skipStackFramesPattern').setAsArray(regexPatterns);
  }
};

Ndb.mainConfiguration = async() => {
  const info = await Ndb.processInfo();
  const cmd = info.argv.slice(2);
  if (cmd.length === 0 || cmd[0] === '.')
    return null;
  let execPath;
  let args;
  if (cmd[0].endsWith('.js')
    || cmd[0].endsWith('.mjs')
    || cmd[0].startsWith('-')) {
    execPath = await Ndb.nodeExecPath();
    args = cmd;
  } else {
    execPath = cmd[0];
    args = cmd.slice(1);
  }
  return {
    name: 'main',
    command: cmd.join(' '),
    execPath,
    args
  };
};

/**
 * @implements {UI.ContextMenu.Provider}
 * @unrestricted
 */
Ndb.ContextMenuProvider = class {
  /**
   * @override
   * @param {!Event} event
   * @param {!UI.ContextMenu} contextMenu
   * @param {!Object} object
   */
  appendApplicableItems(event, contextMenu, object) {
    if (!(object instanceof Workspace.UISourceCode))
      return;
    const url = object.url();
    if (!url.startsWith('file://') || (!url.endsWith('.js') && !url.endsWith('.mjs')))
      return;
    contextMenu.debugSection().appendItem(ls`Run this script`, async() => {
      const platformPath = Common.ParsedURL.urlToPlatformPath(url, Host.isWin());
      const args = url.endsWith('.mjs') ? ['--experimental-modules', platformPath] : [platformPath];
      Ndb.nodeProcessManager.debug(await Ndb.nodeExecPath(), args);
    });
  }
};

Ndb.NodeProcessManager = class extends Common.Object {
  constructor(targetManager) {
    super();
    this._servicePromise = null;
    this._processes = new Map();
    this._lastDebugId = 0;
    this._lastStarted = null;
    this._targetManager = targetManager;
    this._cwds = new Map();
    this._targetManager.addModelListener(
        SDK.RuntimeModel, SDK.RuntimeModel.Events.ExecutionContextDestroyed, this._onExecutionContextDestroyed, this);
  }

  async nddStore() {
    const service = await this._service();
    return service.nddStore();
  }

  infoForTarget(target) {
    return this._processes.get(target.id()) || null;
  }

  async addFileSystem(cwd) {
    let promise = this._cwds.get(cwd);
    if (!promise) {
      async function innerAdd() {
        const cwdUrl = Common.ParsedURL.platformPathToURL(cwd);
        const fileSystemManager = Persistence.isolatedFileSystemManager;
        fileSystemManager.addPlatformFileSystem(cwdUrl, await Ndb.FileSystem.create(fileSystemManager, cwd, cwdUrl));
      }
      promise = innerAdd();
      this._cwds.set(cwd, promise);
    }
    return promise;
  }

  async detected(payload) {
    const pid = payload.id;
    const processInfo = new Ndb.ProcessInfo(payload);
    this._processes.set(pid, processInfo);

    await this.addFileSystem(processInfo.cwd());
    const parentTarget = (payload.ppid ? this._targetManager.targetById(payload.ppid) || this._targetManager.mainTarget() : this._targetManager.mainTarget());
    const target = this._targetManager.createTarget(
        pid, processInfo.userFriendlyName(), SDK.Target.Type.Node,
        parentTarget, pid);
    if (!processInfo.isRepl() && shouldPauseAtStart(payload.argv)) {
      target.runtimeAgent().invoke_evaluate({
        expression: `process.breakAtStart && process.breakAtStart()`,
        includeCommandLineAPI: true
      });
    }
    return target.runtimeAgent().runIfWaitingForDebugger();

    function shouldPauseAtStart(argv) {
      if (argv.find(arg => arg.endsWith('ndb/inspect-brk')))
        return true;
      if (!Common.moduleSetting('pauseAtStart').get())
        return false;
      const [_, arg] = argv;
      if (arg && (arg.endsWith('/bin/npm') || arg.endsWith('\\bin\\npm') ||
          arg.endsWith('/bin/yarn') || arg.endsWith('\\bin\\yarn') ||
          arg.endsWith('/bin/npm-cli.js') || arg.endsWith('\\bin\\npm-cli.js')))
        return false;
      return true;
    }
  }

  disconnected(sessionId) {
    this._processes.delete(sessionId);
    const target = this._targetManager.targetById(sessionId);
    if (target)
      this._targetManager.removeTarget(target);
  }

  dispatchMessage(message) {
    if (this._processes.has(message.sessionId)) {
      InspectorFrontendHost.events.dispatchEventToListeners(
          InspectorFrontendHostAPI.Events.DispatchMessage,
          message);
    }
  }

  /**
   * @override
   * @param {!Protocol.Network.RequestId} requestId
   * @param {!Protocol.Network.MonotonicTime} finishTime
   * @param {number} encodedDataLength
   * @param {boolean=} shouldReportCorbBlocking
   */
  sendLoadingFinished({ type, payload }) {
    window._networkDispatcher.loadingFinished(payload.id, "19094.223976", 100);
  }

  getResponseBody(data) {
    // window._networkDispatcher.loadingFinished(payload.id, "19094.223976", 100);
  }

  responseToFrontEnd(id, result) {
    InspectorFrontendHost.events.dispatchEventToListeners(
      InspectorFrontendHostAPI.Events.DispatchMessage,
      { id, result: { ...result } }
    );
  }

  sendNetworkData({ type, payload }) {
    const req = payload;
    console.log('payload: ', JSON.stringify(payload));
    // {
    //   "protocol": "http:",
    //     "slashes": true,
    //     "auth": null,
    //     "host": "jsonplaceholder.typicode.com",
    //     "port": null,
    //     "hostname": "jsonplaceholder.typicode.com",
    //     "hash": null,
    //     "search": null,
    //     "query": null,
    //     "pathname": "/todos/1",
    //     "path": "/todos/1",
    //     "href": "http://jsonplaceholder.typicode.com/todos/1",
    //     "method": "GET",
    //     "headers": {
    //       "Accept": [
    //         "|)}>#*"
    //       ],
    //       "User-Agent": [
    //         "node-fetch/1.0 (+https://github.com/bitinn/node-fetch)"
    //       ],
    //       "Accept-Encoding": [
    //         "gzip,deflate"
    //       ],
    //       "Connection": [
    //         "close"
    //       ]
    //     }
    // }

    const requestId = getId();

    for(const name in req.headers) {
      req.headers[name] = req.headers[name][0];
    }

    console.log("Rupesh Type: ", type);

    // window._networkDispatcher[type](
    //     requestId,
    //     requestId,
    //     `${req.href}`, // "http://jsonplaceholder.typicode.com/todos/1"
    //     {
    //       "url": `${req.href}`,
    //       "method": `${req.method}`,
    //       "headers": req.headers,
    //       "mixedContentType": "none",
    //       "initialPriority": "VeryHigh",
    //       "referrerPolicy": "no-referrer-when-downgrade"
    //     },
    //     341143.242095,
    //     1544306456.209423,
    //     {},
    //     "",
    //     "XHR"
    //   )


    if(type === "requestWillBeSent") {
      window._networkDispatcher[type](
        requestId,
        requestId,
        `${req.href}`, // "http://jsonplaceholder.typicode.com/todos/1"
        {
          "url": `${req.href}`,
          "method": `${req.method}`,
          "headers": req.headers,
          "mixedContentType": "none",
          "initialPriority": "VeryHigh",
          "referrerPolicy": "no-referrer-when-downgrade"
        },
        341143.242095,
        1544306456.209423,
        {},
        "",
        "XHR"
      )
    } else {
      // response recieved
      console.log("Rupesh inside else block for response", payload);
      window._networkDispatcher.responseReceived(
          payload.id,
          payload.id,
          "19094.223976",
          "Fetch",
          {"url":"https://jsonplaceholder.typicode.com/todos/1","status":200,"statusText":"","headers":{"date":"Wed, 12 Dec 2018 21:34:59 GMT","via":"1.1 vegur","x-content-type-options":"nosniff","cf-cache-status":"MISS","x-powered-by":"Express","status":"200","content-encoding":"br","pragma":"no-cache","server":"cloudflare","etag":"W/\"53-hfEnumeNh6YirfjyjaujcOPPT+s\"","expect-ct":"max-age=604800, report-uri=\"https://report-uri.cloudflare.com/cdn-cgi/beacon/expect-ct\"","vary":"Origin, Accept-Encoding","content-type":"application/json; charset=utf-8","access-control-allow-origin":"chrome-extension://nkeimhogjdpnpccoofpliimaahmaaome","cache-control":"public, max-age=14400","access-control-allow-credentials":"true","set-cookie":"__cfduid=d86ce931710da6052d6b1c2efd6c549741544650499; expires=Thu, 12-Dec-19 21:34:59 GMT; path=/; domain=.typicode.com; HttpOnly","cf-ray":"488351751c0d6bf2-SJC","expires":"Thu, 13 Dec 2018 01:34:59 GMT"},"mimeType":"application/json","requestHeaders":{":path":"/todos/1","origin":"chrome-extension://nkeimhogjdpnpccoofpliimaahmaaome","accept-encoding":"gzip, deflate, br","accept-language":"en-US,en;q=0.9","user-agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3638.0 Safari/537.36","accept":"*/*",":authority":"jsonplaceholder.typicode.com",":scheme":"https",":method":"GET"},"connectionReused":false,"connectionId":3141,"remoteIPAddress":"104.31.92.98","remotePort":443,"fromDiskCache":false,"fromServiceWorker":false,"encodedDataLength":506,"timing":{"requestTime":19093.951776,"proxyStart":-1,"proxyEnd":-1,"dnsStart":0.978,"dnsEnd":12.624,"connectStart":12.624,"connectEnd":71.036,"sslStart":17.733,"sslEnd":71.027,"workerStart":-1,"workerReady":-1,"sendStart":71.301,"sendEnd":71.42,"pushStart":0,"pushEnd":0,"receiveHeadersEnd":270.08},"protocol":"h2","securityState":"secure","securityDetails":{"protocol":"TLS 1.3","keyExchange":"","keyExchangeGroup":"X25519","cipher":"AES_128_GCM","certificateId":0,"subjectName":"sni233425.cloudflaressl.com","sanList":["sni233425.cloudflaressl.com","*.abel.am","*.astrosteamfanstore.com","*.attirehut.com","*.bizareads.ga","*.blackforestdynamics.com","*.blackforestmetalworks.com","*.buyacrgxz.gq","*.coree-galisan.eu.org","*.dinlumusu.ga","*.discord-reloaded.com","*.discoveryblock.com","*.dramaspk.online","*.efreidoc.fr","*.evideardditiva.tk","*.gaimiwijnwris.gq","*.giantsfansapparelshop.com","*.hackwalkingwarrobots.win","*.importerhsquah.ml","*.jailitniro.cf","*.jsonplaceholder.com","*.kami2hackedonline.win","*.merfimasi.ga","*.nnsat.ru","*.oliveira29.work","*.packerscollectionshop.com","*.philliesedgeshop.com","*.porno-vip.net","*.pricevfqdwr.ml","*.ravenslockerroom.com","*.raysteamfanstore.com","*.rittyresar.ml","*.rocode.net","*.sangatmurah.net","*.soljuconre.ml","*.sp-zdorovoedyhanie.ru","*.titansfansgearshop.com","*.top-kal.com","*.tracdercilea.cf","*.typicode.com","*.unilpote.tk","*.v-vnnreviews.cf","abel.am","astrosteamfanstore.com","attirehut.com","bizareads.ga","blackforestdynamics.com","blackforestmetalworks.com","buyacrgxz.gq","coree-galisan.eu.org","dinlumusu.ga","discord-reloaded.com","discoveryblock.com","dramaspk.online","efreidoc.fr","evideardditiva.tk","gaimiwijnwris.gq","giantsfansapparelshop.com","hackwalkingwarrobots.win","importerhsquah.ml","jailitniro.cf","jsonplaceholder.com","kami2hackedonline.win","merfimasi.ga","nnsat.ru","oliveira29.work","packerscollectionshop.com","philliesedgeshop.com","porno-vip.net","pricevfqdwr.ml","ravenslockerroom.com","raysteamfanstore.com","rittyresar.ml","rocode.net","sangatmurah.net","soljuconre.ml","sp-zdorovoedyhanie.ru","titansfansgearshop.com","top-kal.com","tracdercilea.cf","typicode.com","unilpote.tk","v-vnnreviews.cf"],"issuer":"COMODO ECC Domain Validation Secure Server CA 2","validFrom":1543708800,"validTo":1560211199,"signedCertificateTimestampList":[{"status":"Verified","origin":"Embedded in certificate","logDescription":"Google 'Skydiver' log","logId":"BBD9DFBC1F8A71B593942397AA927B473857950AAB52E81A909664368E1ED185","timestamp":1543763508555,"hashAlgorithm":"SHA-256","signatureAlgorithm":"ECDSA","signatureData":"3045022100EE69148AF47F7F7CECE4493B3F2483AFFDDE4F0BE7C1B0542F71B5AD510C7126022018856AF954B2B33F25210DF6C6A28FF50FF6EA85475742E7880192EAA3B7DFC8"},{"status":"Verified","origin":"Embedded in certificate","logDescription":"Cloudflare 'Nimbus2019' Log","logId":"747EDA8331AD331091219CCE254F4270C2BFFD5E422008C6373579E6107BCC56","timestamp":1543763508642,"hashAlgorithm":"SHA-256","signatureAlgorithm":"ECDSA","signatureData":"3046022100E17D4AB967E27A418F60579F711978B3C486DE499EF63DCF20C3316D6FA0D83A022100C6406C94E838C2171F79BD52CB2EF8D29E07F108A10103E485877A2137E3A699"}],"certificateTransparencyCompliance":"compliant"}}
      )

    }


  }

  async _sendMesage(message) {
    const service = await this._service();
    return service.sendMessage(message);
  }

  _service() {
    if (!this._servicePromise) {
      async function service() {
        const service = await Ndb.backend.createService('ndd_service.js');
        await service.init(rpc.handle(this));

        const network = await Ndb.backend.createService('network.js');
        await network.init(rpc.handle(this));

        InspectorFrontendHost.sendMessageToBackend = this._sendMesage.bind(this);
        return service;
      }
      this._servicePromise = service.call(this);
    }
    return this._servicePromise;
  }

  async _onExecutionContextDestroyed(event) {
    const executionContext = event.data;
    const mainContextId = 1;
    if (executionContext.id !== mainContextId)
      return;
    const target = executionContext.target();
    if (target.suspended()) {
      const debuggerModel = target.model(SDK.DebuggerModel);
      await new Promise(resolve => debuggerModel.addEventListener(
          SDK.DebuggerModel.Events.DebuggerWasEnabled, resolve));
    }
    const service = await this._service();
    service.disconnect(target.id());
  }

  async debug(execPath, args, options) {
    options = options || {};
    const service = await this._service();
    const debugId = options.data || String(++this._lastDebugId);
    this._lastStarted = {execPath, args, debugId};
    const info = await Ndb.processInfo();
    return service.debug(
        execPath, args, {
          ...options,
          data: debugId,
          cwd: info.cwd,
        });
  }

  async kill(target) {
    const service = await this._service();
    return service.kill(target.id());
  }

  async restartLast() {
    if (!this._lastStarted)
      return;
    const promises = [];
    for (const target of SDK.targetManager.targets()) {
      const info = this.infoForTarget(target);
      if (!info)
        continue;
      if (info.data() === this._lastStarted.debugId)
        promises.push(this.kill(target));
    }
    await Promise.all(promises);
    const {execPath, args} = this._lastStarted;
    await this.debug(execPath, args);
  }
};

Ndb.ProcessInfo = class {
  constructor(payload) {
    this._argv = payload.argv;
    this._cwd = payload.cwd;
    this._data = payload.data;
    this._isRepl = payload.data === 'ndb/repl';
  }

  argv() {
    return this._argv;
  }

  data() {
    return this._data;
  }

  cwd() {
    return this._cwd;
  }

  userFriendlyName() {
    if (this._isRepl)
      return 'repl';
    return this.argv().map(arg => {
      const index1 = arg.lastIndexOf('/');
      const index2 = arg.lastIndexOf('\\');
      if (index1 === -1 && index2 === -1)
        return arg;
      return arg.slice(Math.max(index1, index2) + 1);
    }).join(' ');
  }

  isRepl() {
    return this._isRepl;
  }
};

/**
 * @implements {UI.ActionDelegate}
 * @unrestricted
 */
Ndb.RestartActionDelegate = class {
  /**
   * @override
   * @param {!UI.Context} context
   * @param {string} actionId
   * @return {boolean}
   */
  handleAction(context, actionId) {
    switch (actionId) {
      case 'ndb.restart':
        Ndb.nodeProcessManager.restartLast();
        return true;
    }
    return false;
  }
};

SDK.DebuggerModel.prototype.scheduleStepIntoAsync = function() {
  this._agent.scheduleStepIntoAsync();
  this._agent.invoke_stepInto({breakOnAsyncCall: true});
};

// Temporary hack until frontend with fix is rolled.
// fix: TBA.
SDK.Target.prototype.decorateLabel = function(label) {
  return this.name();
};

// Front-end does not respect modern toggle semantics, patch it.
const originalToggle = DOMTokenList.prototype.toggle;
DOMTokenList.prototype.toggle = function(token, force) {
  if (arguments.length === 1)
    force = !this.contains(token);
  return originalToggle.call(this, token, !!force);
};

/**
 * @param {string} sourceMapURL
 * @param {string} compiledURL
 * @return {!Promise<?SDK.TextSourceMap>}
 * @this {SDK.TextSourceMap}
 */
SDK.TextSourceMap.load = async function(sourceMapURL, compiledURL) {
  const {payload, error} = await Ndb.backend.loadSourceMap(sourceMapURL, compiledURL);
  if (error || !payload)
    return null;
  try {
    return new SDK.TextSourceMap(compiledURL, sourceMapURL, payload);
  } catch (e) {
    console.error(e);
    Common.console.warn('DevTools failed to parse SourceMap: ' + sourceMapURL);
    return null;
  }
};
