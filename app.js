var express = require('express');
var path = require('path');
var fs = require('fs');
var https = require('https');
// var io_cilent = require('engine.io-client');

var credentials = {
  key: fs.readFileSync('./cert/file.pem'),
  cert: fs.readFileSync('./cert/file.crt')
};
var serverPort = 3000;


var app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'node_modules/socket.io/node_modules/socket.io-client')));
// app.use(express.static(path.join(__dirname, 'node_modules/engine.io-client')));

app.get('/', function (req, res) {
  res.send('Hello World!');
});

var httpsServer = https.createServer(credentials, app);

var server = httpsServer.listen(serverPort, function () {
  var host = server.address().address;
  var port = server.address().port;
  console.log('Example app listening at http://%s:%s', host, port);
});


var io = require('socket.io').listen(server);

(function(){

  var self = this;
  self.io_namespace = io.of("/");
	self.io_namespace.on('connection', function(socket){
		console.log("connected");
	  socket.on('disconnect', function(){
	    console.log('user disconnected');
	  });
	  
		socket.on('chat_msg', function(data){
	    console.log(data);
      socket.emit('test', data.name);
	  });

		socket.on('file_upload', function(data){
	    console.log(data.filename);
	    fs.writeFile('aaa.jpg', data.buffer);

	  });


	});

}());


