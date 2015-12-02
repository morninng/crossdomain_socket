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

		ss(socket).on('audio_record_start', function(stream, data){
			console.log("audio record start");
			var outfile_name  = data.filename;
			eval("self.file_writer_count_" + outfile_name + "=1");
			var outfile_name_wav  = './public/audio/' + outfile_name + "_1.wav";

			var sample_rate = data.sample_rate || 44100;
			socket.file_writer = new wav.FileWriter(
			 outfile_name_wav, 
			 {channels:1,
			  sampleRate:sample_rate,
			  bitDepth:16}
			);
			stream.pipe(socket.file_writer);
		});

		ss(socket).on('audio_record_resume', function(stream, data){
			console.log("audio record resume");

			var outfile_name  = data.filename;
			var prev_count = eval("self.file_writer_count_" + outfile_name );
			if(!prev_count){
				return;
			}

			var next_count = prev_count + 1;
			eval("self.file_writer_count_" + outfile_name + "=next_count");
			var outfile_name_wav  = './public/audio/' +  outfile_name + "_" + String(next_count)  + ".wav";

			var sample_rate = data.sample_rate || 44100;
			socket.file_writer = new wav.FileWriter(
				 outfile_name_wav, 
				 {channels:1,
				  sampleRate:sample_rate,
				  bitDepth:16}
			);
			stream.pipe(socket.file_writer);

		});

		socket.on('audio_record_suspend', function(data){
			console.log("audio suspend");
			if(socket.file_writer){
			  socket.file_writer.end();
			  socket.file_writer = null;
			}
		});

		socket.on('audio_record_end', function(data){
			console.log("audio recording end");
			var outfile_name  = data.filename;
			if(!socket.file_writer){
				return;
			}else{
				var count = eval("self.file_writer_count_" + outfile_name );
			  transcode_file_upload_s3_command(outfile_name, count);
			  socket.file_writer.end();
			  socket.file_writer = null;
			}
		});
	});

}());





function transcode_file_upload_s3_command(file_name, count){


  console.log("transcode command is called");
	// var source_file = './' + file_name + '.wav';


	var dest_file = './public/audio/' + file_name + '.mp3';
	var dest_file_name = './public/audio/' + file_name + '.mp3';

	var wstream = fs.createWriteStream(dest_file);
	//var command = SoxCommand().input(source_file).output(wstream).outputFileType('mp3');
	var command = SoxCommand().output(wstream).outputFileType('mp3');

	var source_file_list = new Array();
	var file_list_len = count;
	for(var i=0; i< file_list_len; i++){
		var each_file_name = './public/audio/' + file_name + "_"+ String(i+1) + '.wav'
		command.input(each_file_name);
	}

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