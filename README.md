flac.js: A FLAC decoder in JavaScript
=====================================

The Free Lossless Audio Codec (FLAC) is a widely used lossless audio codec, which means that the audio is compressed 
without any loss of quality.  A decoded FLAC stream is bit-for-bit identical to the original uncompressed audio file.

The JavaScript decoder was ported from the [FFMpeg project](http://ffmpeg.org/) and the demuxer is based on the original
[FLAC documentation](http://flac.sourceforge.net/format.html).  flac.js uses the 
[Aurora](https://github.com/audiocogs/aurora.js) audio framework by ofmlabs to facilitate decoding and playback.

## Demo

You can check out a [demo](http://audiocogs.org/codecs/flac/) alongside our other decoders 
[alac.js](http://github.com/audiocogs/alac.js), [MP3.js](http://github.com/devongovett/mp3.js), and [AAC.js](http://github.com/audiocogs/aac.js).  Currently flac.js
works properly in the latest versions of Firefox, Chrome, and Safari.

## Authors

flac.js was written by [@jensnockert](http://github.com/jensnockert) and [@devongovett](http://github.com/devongovett) 
of [Audiocogs](http://audiocogs.org/).

## Building
    
Currently, the [importer](https://github.com/devongovett/importer) module is used to build flac.js.  You can run
the development server on port `3030` by first installing `importer` with npm, and then running it like this:

    npm install importer -g
    importer flac.js -p 3030
    
You can also build a static version like this:

    importer flac.js build.js

flac.js depends on [Aurora.js](https://github.com/audiocogs/aurora.js), our audio codec framework.  You will need
to include either a prebuilt version of Aurora.js, or start another `importer` development server for Aurora before
flac.js will work.  You can use the [test.html](https://github.com/audiocogs/aurora.js/blob/master/src/test.html) file
in the Aurora.js repo as an example of how to use the APIs to play back audio files.  Just include flac.js on that 
page as well in order to add support for FLAC files.
    
## License

flac.js is licensed under the same terms as the original FLAC decoder in FFMpeg. The original
license follows.

    FLAC.js is free software; you can redistribute it and/or
    modify it under the terms of the GNU Lesser General Public
    License as published by the Free Software Foundation; either
    version 2.1 of the License, or (at your option) any later version.

    FLAC.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
    Lesser General Public License for more details.
