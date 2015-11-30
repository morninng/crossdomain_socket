var express = require('express');
var path = require('path');
var fs = require('fs');
var https = require('https');
var wav = require('wav');
var sox = require('sox');
var SoxCommand = require('sox-audio');

// var streamBuffers = require("stream-buffers");
var ss = require('socket.io-stream');
var config = require('./config/mixidea.conf');
console.log("bucket name is " + config.BucketName);

var AWS = require('aws-sdk');
AWS.config.update({accessKeyId: config.AwsKeyId, secretAccessKey: config.SecretKey});
s3 = new AWS.S3({params: {Bucket:config.BucketName} });
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

	self.io_namespace.on('connection', function(socket){
		console.log("connected");
		socket.setMaxListeners(Infinity);

	  socket.on('disconnect', function(){
	    console.log('user disconnected');
	  });


		socket.on('audio_record_start', function(data){
			console.log("audio record start");
			self.outfile_name  = data.filename + "_aaa";
			self.outfile_name_wav  = self.outfile_name + ".wav";
			self.outfile_name_mp3  = self.outfile_name + ".mp3";
			var sample_rate = data.sample_rate || 44100;
			if(!self.filewriter_aaa){
				self.filewriter_aaa = new wav.FileWriter(self.outfile_name_wav, {
						channels:1,
						sampleRate:sample_rate,
						bitDepth:16});
			}
	  });

		ss(socket).on('audio_upload', function(stream){
			console.log("audio upload called and it is piped to file writer");
			stream.pipe(self.filewriter_aaa);
		});

		socket.on('audio_record_end', function(data){
			console.log("audio recording finished");
			if(self.filewriter_aaa){

				if(true){ //add condition to record the file
			    transcode_file_upload_s3_command(self.outfile_name);

				}
				self.filewriter_aaa.end();
				self.filewriter_aaa = null;
			}
		});
	});

}());





function transcode_file_upload_s3_command(file_name){


  console.log("transcode command is called");
	var source_file = './' + file_name + '.wav';
	var dest_file = './' + file_name + '.mp3';
	var dest_file_name = file_name + '.mp3';

	var wstream = fs.createWriteStream(dest_file);
	var command = SoxCommand().input(source_file).output(wstream).outputFileType('mp3');


	command.on('progress', function(progress) {
	  console.log('Processing progress: ', progress);
	});
	 
	command.on('error', function(err, stdout, stderr) {
	  console.log('Cannot process audio: ' + err.message);
	  console.log('Sox Command Stdout: ', stdout);
	  console.log('Sox Command Stderr: ', stderr)
	});
	 
	command.on('end', function() {
	  console.log('Sox command succeeded!');
	  wstream.end();
		fs.readFile(dest_file_name, function (err, data) {
			s3.putObject(
				{Key: dest_file_name, ContentType: "audio/mp3", Body: data, ACL: "public-read"},
				function(error, data){
					if(data !==null){
						console.log("succeed to save data on S3");
					}else{
						console.log("fai to save data" + error + data);
					}
				}
			);
		});

	});

	command.run();

}