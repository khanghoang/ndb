const fetch = require('node-fetch');

fetch('http://jsonplaceholder.typicode.com/todos/5')
    .then(response => response.json())
    .then(json => console.log(json))
