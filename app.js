var express = require('express');
var path = require('path');
var fs = require('fs');
var https = require('https');
var wav = require('wav');
// var streamBuffers = require("stream-buffers");
var ss = require('socket.io-stream');
// var io_cilent = require('engine.io-client');

var credentials = {
  key: fs.readFileSync('./cert/mixidea.key'),
  cert: fs.readFileSync('./cert/mixidea.cert')
};
var serverPort = 3000;


var app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'node_modules/socket.io/node_modules/socket.io-client')));
app.use(express.static(path.join(__dirname, 'node_modules/socket.io-stream/')));
// app.use(express.static(path.join(__dirname, 'node_modules/engine.io-client')));

app.get('/', function (req, res) {
  res.send('Hello World!');
});

var httpServer = https.createServer(credentials, app);

var server = httpServer.listen(serverPort, function () {
  var host = server.address().address;
  var port = server.address().port;
  console.log('Example app listening at http://%s:%s', host, port);
});


var io = require('socket.io').listen(server);
io.sockets.setMaxListeners(0);

(function(){

  var self = this;
  self.io_namespace = io.of("/");
//  self.io_namespace.setMaxListeners(Infinity);

	self.io_namespace.on('connection', function(socket){
		console.log("connected");
		socket.setMaxListeners(Infinity);

	  socket.on('disconnect', function(){
	    console.log('user disconnected');
	  });
/*	  
		socket.on('chat_msg', function(data){
	    console.log(data);
      socket.emit('test', data.name);
	  });
*/
/*
		socket.on('file_upload', function(data){
	    console.log(data.filename);
	    fs.writeFile('aaa.jpg', data.buffer);	  });
*/
		socket.on('audio_record_start', function(data){
			console.log("audio record start");
			var outfile  = data.filename + "_aaa.wav";
			var sample_rate = data.sample_rate || 44100;
			if(!self.filewriter_aaa){
				self.filewriter_aaa = new wav.FileWriter(outfile, {
						channels:1,
						sampleRate:sample_rate,
						bitDepth:16});
/*
				var myReadableStreamBuffer = new streamBuffers.ReadableStreamBuffer({
				    frequency:  0,        // in milliseconds.
				    chunkSize: 40960       // in bytes.
				});
				myReadableStreamBuffer.setMaxListeners(Infinity);
				*/
			}
	  });

		ss(socket).on('audio_upload', function(stream){
			console.log("audio upload called and it is piped to file writer");
			//console.log(filewriter_aaa);
			//myReadableStreamBuffer.put(data.buffer);
			//data.buffer.pipe(filewriter_aaa);
			stream.pipe(self.filewriter_aaa);
		});

		socket.on('audio_record_end', function(data){
			console.log("audio recording finished");
			if(self.filewriter_aaa){
				self.filewriter_aaa.end();
				self.filewriter_aaa = null;
			}
		});
	});

}());

/*
function Recording(){
	
}
*/