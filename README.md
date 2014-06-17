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
    
We use [browserify](https://github.com/substack/node-browserify) to build flac.js.  You can download a
prebuilt version from the Github [releases](https://github.com/audiocogs/flac.js/releases) page. 
To build flac.js for the browser yourself, use the following commands:

    npm install
    make browser
    
This will place a built `flac.js` file, as well as a source map in the `build/` directory.

flac.js depends on [Aurora.js](https://github.com/audiocogs/aurora.js), our audio codec framework.
For detailed information on how to use Aurora.js, check out the [documentation](https://github.com/audiocogs/aurora.js/wiki).
    
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
