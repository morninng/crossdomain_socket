var express = require('express');
var path = require('path');
var fs = require('fs');
var https = require('https');
var wav = require('wav');
var sox = require('sox');
var SoxCommand = require('sox-audio');
var ss = require('socket.io-stream');
var config = require('./config/mixidea.conf');
var Parse = require('parse/node');


var log4js = require('log4js');
log4js.configure({
    appenders: [
        {
            "type": "dateFile",
            "category": "request",
            "filename": "logs/request.log",
            "pattern": "-yyyy-MM-dd"            
        },

    ]
});
var loggerRequest = log4js.getLogger('request');


Parse.initialize(config.ParseAppID, config.ParseAppKey);

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
		loggerRequest.info('connected');
		socket.setMaxListeners(Infinity);

	  socket.on('disconnect', function(){
	    console.log('user disconnected');
			loggerRequest.info('user disconnected');
	  });

	  socket.on('join_room', function(data){
	  	socket.join(data.room_name);
	    console.log('user join in the name room: ' + data.room_name + ", socketid is " + socket.id);
			loggerRequest.info('user join in the name room: ' + data.room_name + ", socketid is " + socket.id);
	  });

		ss(socket).on('audio_record_start', function(stream, data){
			console.log("audio record start " + socket.id);
			loggerRequest.info("audio record start " + socket.id);
			var outfile_name  = data.filename;
			var record_start_time = Date.now();
			eval("self.file_writer_count_" + outfile_name + "=1");
			eval("self.record_start_time_" + outfile_name + "=" + record_start_time);
			var outfile_name_wav  = './public/audio/' + outfile_name + "_1.wav";
			console.log("output file name is " + outfile_name_wav);
			loggerRequest.info("output file name is " + outfile_name_wav);

			var sample_rate = data.sample_rate || 44100;
			socket.file_writer = new Array();
			socket.file_writer[0] = new wav.FileWriter(
			 outfile_name_wav,
			 {channels:1,
			  sampleRate:sample_rate,
			  bitDepth:16}
			);
			stream.pipe(socket.file_writer[0]);
		});

		ss(socket).on('audio_record_resume', function(stream, data){
			console.log("audio record resume " + socket.id);
			loggerRequest.info("audio record resume " + socket.id);

			var outfile_name  = data.filename;
			var prev_count = eval("self.file_writer_count_" + outfile_name );

			if(!prev_count){
				return;
			}

			var next_count = prev_count + 1;
			console.log("resume count is " + next_count);
			loggerRequest.info("resume count is " + next_count);
			eval("self.file_writer_count_" + outfile_name + "=next_count");
			var outfile_name_wav  = './public/audio/' +  outfile_name + "_" + String(next_count)  + ".wav";
			console.log("output file name is " + outfile_name_wav);
			loggerRequest.info("output file name is " + outfile_name_wav);

			var sample_rate = data.sample_rate || 44100;
			socket.file_writer = socket.file_writer || new Array();
			socket.file_writer[next_count] = new wav.FileWriter(
				 outfile_name_wav, 
				 {channels:1,
				  sampleRate:sample_rate,
				  bitDepth:16}
			);
			stream.pipe(socket.file_writer[next_count]);

		});

		socket.on('audio_record_suspend', function(data){
			console.log("audio suspend " + socket.id);
			loggerRequest.info("audio suspend " + socket.id);
			if(socket.file_writer){
			//  socket.file_writer.end();
			//  socket.file_writer = null;
			}
		});

		socket.on('audio_record_end', function(data){
			console.log("audio recording end " + socket.id);
			loggerRequest.info("audio recording end " + socket.id);
			var outfile_name  = data.filename;
			var role_name  = data.role_name;
			var speech_transcript_id  = data.speech_transcript_id;
			var room_name = data.room_name;
			console.log("file name is " + outfile_name);
			loggerRequest.info("file name is " + outfile_name);
			console.log("role name is " + role_name);
			loggerRequest.info("role name is " + role_name);
			console.log(" speech transcription id is " + speech_transcript_id);
			loggerRequest.info(" speech transcription id is " + speech_transcript_id);
			if(!socket.file_writer){
				return;
			}else{
			  var record_start_time = eval("self.record_start_time_" + outfile_name);
				var record_duration = Date.now() - record_start_time;
				var count = eval("self.file_writer_count_" + outfile_name );
				console.log("recording duration is " + record_duration + " msec");
				loggerRequest.info("recording duration is " + record_duration + " msec");
				console.log("file count is " + count );
				loggerRequest.info("file count is " + count );
				//setTimeout("self.record_end_action(outfile_name, count)", record_duration);
				setTimeout(function(){
					transcode_file_upload_s3_command(outfile_name, count, speech_transcript_id, role_name, room_name);
					eval(" delete self.file_writer_count_" + outfile_name );
					eval(" delete self.record_start_time_" + outfile_name );
				}, record_duration);



			//  socket.file_writer.end();
			//  socket.file_writer = null;
			}
		});
	});






self.transcode_file_upload_s3_command = function(file_name, count, speech_transcript_id, role_name , room_name)
{

  console.log("transcode command is called");
	loggerRequest.info("transcode command is called");
	var dest_file = './public/audio/' + file_name + '.mp3';
	var file_name_on_s3 = file_name + '.mp3';
	var wstream = fs.createWriteStream(dest_file);
	var command = SoxCommand().output(wstream).outputFileType('mp3');

	var source_file_list = new Array();
	var file_list_len = count;
	for(var i=0; i< file_list_len; i++){
		var each_file_name = './public/audio/' + file_name + "_"+ String(i+1) + '.wav'
		console.log(each_file_name);
		loggerRequest.info(each_file_name);
		command.input(each_file_name);
	}

	command.on('progress', function(progress) {
	  console.log('Processing progress: ', progress);
		loggerRequest.info('Processing progress: ', progress);
	});
	 
	command.on('error', function(err, stdout, stderr) {
	  console.log('Cannot process audio: ' + err.message);
		loggerRequest.info('Cannot process audio: ' + err.message);
	  console.log('Sox Command Stdout: ', stdout);
		loggerRequest.info('Sox Command Stdout: ', stdout);
	  console.log('Sox Command Stderr: ', stderr);
		loggerRequest.info('Sox Command Stderr: ', stderr);
	});
	 
	command.on('end', function() {
	  console.log('Sox command succeeded!');
		loggerRequest.info('Sox command succeeded!');
	  wstream.end();
		fs.readFile(dest_file, function (err, data) {
			s3.putObject(
				{Key: file_name_on_s3, ContentType: "audio/mp3", Body: data, ACL: "public-read"},
				function(error, data){
					if(data !==null){
						console.log("succeed to save data on S3");
						loggerRequest.info("succeed to save data on S3");

						save_AudioInfo_onParse(file_name_on_s3, speech_transcript_id, role_name, room_name);

					}else{
						console.log("fai to save data" + error + data);
						loggerRequest.info("fai to save data" + error + data);
					}
				}
			);
		});

	});
	command.run();
}

self.save_AudioInfo_onParse = function(file_name, speech_transcript_id , role_name, room_name)
{

	var Speech_Transcription = Parse.Object.extend("Speech_Transcription");
	var speech_tran_query = new Parse.Query(Speech_Transcription);
	speech_tran_query.get(speech_transcript_id, {
		success: function(speech_tran_obj) {
			var audio_url = config.S3_audio_url + config.BucketName + "/" + file_name;
			speech_tran_obj.set(role_name + "_Audio",audio_url);
			speech_tran_obj.save(null,{
				success: function(){
					console.log("succeed to save data on parse");
					loggerRequest.info("succeed to save data on parse");
					console.log(audio_url);
					loggerRequest.info(audio_url);
					self.io_namespace.to(room_name).emit('audio_saved', {file_saved: file_name});
				},
				error: function(){
					console.log("fail to save data");
					loggerRequest.info("fail to save data");
				}
			});			
		},
		error: function(object, error) {
			console.log("fail to save data on parse");
			loggerRequest.info("fail to save data on parse");
		}
	});
}






}());