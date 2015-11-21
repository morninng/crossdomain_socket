
function Recording(){
	var self = this;
	self.available = false
	self.recording = false;
	self.initialize();

	self.start_record = function(){
		console.log("start recording");
		self.socket_io.emit('audio_record_start', {filename:"audio",sample_rate:self.sample_rate})
		self.recording = true;
		ss(self.socket_io).emit('audio_upload', self.stream, {name: 'aaa'});
	}

	self.stop_record = function(){
		console.log("stop recording");
		self.recording = false;
		self.stream.end();
		self.socket_io.emit('audio_record_end', {filename:"audio"})
	}
}

Recording.prototype.initialize = function(){

	var self = this;

	if (!navigator.getUserMedia){
		navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia ||
		navigator.mozGetUserMedia || navigator.msGetUserMedia;
	}

	if (navigator.getUserMedia) {
		navigator.getUserMedia(
			{audio:true},
			 function(stream){self.start_audio_polling(stream); console.log("aa")},
			 function(e) {console.log('Error'); } );
	} else{
		console.log('getUserMedia not supported');
	}
}


Recording.prototype.set_socket = function(in_socket){
	var self = this;
	console.log("set socket");
	self.socket_io = in_socket;
}



Recording.prototype.start_audio_polling = function(stream){

	var self = this;
	self.available = true;
	self.stream = ss.createStream();
	console.log("audio polling stream id " + self.stream.id)

	audioContext = window.AudioContext || window.webkitAudioContext;
	context = new audioContext();
	self.sample_rate = context.sampleRate;
	audioInput = context.createMediaStreamSource(stream);
	var bufferSize = 4096;
	
	//self.recorder = context.createScriptProcessor(bufferSize, 1, 1);
	self.scriptNode = context.createScriptProcessor(bufferSize, 1, 1);

	self.scriptNode.onaudioprocess = function(audioProcessingEvent){
	  if(!self.recording || !self.socket_io ){
	   return;
	  }
	  var left = audioProcessingEvent.inputBuffer.getChannelData(0);
	  var audio_array_buffer = convertoFloat32ToInt16(left);
		var stream_buffer = new ss.Buffer(audio_array_buffer);
		self.stream.write(stream_buffer, 'buffer');

	}
	audioInput.connect(self.scriptNode)
	self.scriptNode.connect(context.destination); 
}



function convertoFloat32ToInt16(buffer) {
  var len = buffer.length;

  var double_len = len*2;
  var unit8_buf = new Uint8Array(len);
  var int16_variable = new Int16Array(1);

  for (var i=0; i< len; i++) {
    int16_variable[0] = buffer[i]*0x7FFF;    //convert to 16 bit PCM
    unit8_buf[2*i] = int16_variable[0] & 0x00FF; //convert to uint8 for stream buffer
    unit8_buf[2*i+1] = (int16_variable[0] & 0xFF00) >> 8;
  }

  return unit8_buf.buffer
}
