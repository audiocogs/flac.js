flac.js: A FLAC decoder in JavaScript
=====================================

The Free Lossless Audio Codec (FLAC) is a widely used lossless audio codec, which means that the audio is compressed 
without any loss of quality.  A decoded FLAC stream is bit-for-bit identical to the original uncompressed audio file.

The JavaScript decoder was ported from the [FFMpeg project](http://ffmpeg.org/) and the demuxer is based on the original
[FLAC documentation](http://flac.sourceforge.net/format.html).  flac.js uses the 
[Aurora](https://github.com/ofmlabs/aurora.js) audio framework by ofmlabs to facilitate decoding and playback.

## Demo

You can check out a [demo](http://labs.official.fm/codecs/flac.js/) alongside our other decoders 
[jsmad](http://github.com/ofmlabs/jsmad) (MP3), and [alac.js](http://github.com/ofmlabs/alac.js).  Currently flac.js
works properly in the latest versions of Firefox and Chrome, as well as Safari 6 beta.

## Authors

flac.js was written by [@jensnockert](http://github.com/jensnockert) and [@devongovett](http://github.com/devongovett) 
of [ofmlabs](http://ofmlabs.org/).

## Building
    
Currently, the [import](https://github.com/devongovett/import) module is used to build flac.js.  You can run
the development server by first installing `import` with npm, and then running it like this:

    sudo npm install import -g
    import flac.js -p 3030
    
You can also build a static version like this:

    import flac.js build.js
    
Once it is running on port 3030, you can open test.html and select a flac file from your system to play back.
    
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