var AV = require('av');

// if ogg.js exists, register a plugin
try {
  var OggDemuxer = require('ogg.js');
} catch (e) {};
if (!OggDemuxer) return;

OggDemuxer.plugins.push({
  magic: "\177FLAC",
  
  init: function() {
    this.list = new AV.BufferList();
    this.stream = new AV.Stream(this.list);
  },
  
  readHeaders: function(packet) {
    var stream = this.stream;
    this.list.append(new AV.Buffer(packet));
    
    stream.advance(5); // magic
    if (stream.readUInt8() != 1)
      throw new Error('Unsupported FLAC version');
      
    stream.advance(3);
    if (stream.peekString(0, 4) != 'fLaC')
      throw new Error('Not flac');
      
    this.flac = AV.Demuxer.find(stream.peekSingleBuffer(0, stream.remainingBytes()));
    if (!this.flac)
      throw new Error('Flac demuxer not found');
    
    this.flac.prototype.readChunk.call(this);
    return true;
  },
  
  readPacket: function(packet) {
    this.list.append(new AV.Buffer(packet));
    this.flac.prototype.readChunk.call(this);
  }
});
