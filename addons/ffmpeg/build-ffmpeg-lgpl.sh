#!/bin/bash
# Velvet LGPL ffmpeg.wasm core: FFmpeg n5.1.4 (LGPL-2.1+, no --enable-gpl/nonfree) + OpenH264 (BSD-2) for H.264 encoding.
# Usage: build.sh st|mt
set -euo pipefail
MODE=${1:-st}
B=/workspace/ffbuild
source $B/emsdk/emsdk_env.sh >/dev/null 2>&1
export INSTALL_DIR=$B/opt-$MODE
if [ $MODE = mt ]; then XF="-O3 -msimd128 -sUSE_PTHREADS -pthread"; export FFMPEG_MT=yes; unset FFMPEG_ST || true; else XF="-O3 -msimd128"; export FFMPEG_ST=yes; unset FFMPEG_MT || true; fi
export CFLAGS="-I$INSTALL_DIR/include $XF" CXXFLAGS="-I$INSTALL_DIR/include $XF" LDFLAGS="-L$INSTALL_DIR/lib $XF"
export EM_PKG_CONFIG_PATH=$INSTALL_DIR/lib/pkgconfig PKG_CONFIG_PATH=$INSTALL_DIR/lib/pkgconfig
mkdir -p $INSTALL_DIR
echo "== openh264 $MODE"
if [ ! -f $INSTALL_DIR/lib/libopenh264.a ]; then
  rm -rf $B/oh-$MODE && cp -a $B/openh264 $B/oh-$MODE && cd $B/oh-$MODE
  emmake make -j8 OS=linux ARCH=wasm USE_ASM=No CC=emcc CXX=em++ AR=emar CFLAGS_OPT="$XF" PREFIX=$INSTALL_DIR libopenh264.a
  emmake make OS=linux ARCH=wasm USE_ASM=No CC=emcc CXX=em++ AR=emar PREFIX=$INSTALL_DIR install-static
fi
echo "== ffmpeg $MODE"
SRC=$B/ff-$MODE
if [ ! -f $SRC/libavcodec/libavcodec.a ]; then
  rm -rf $SRC && cp -a $B/ffmpeg-src $SRC && cd $SRC
  emconfigure ./configure --target-os=none --arch=x86_32 --enable-cross-compile --disable-asm --disable-stripping --disable-programs --disable-doc --disable-debug --disable-runtime-cpudetect --disable-autodetect \
    --nm=emnm --ar=emar --ranlib=emranlib --cc=emcc --cxx=em++ --objcc=emcc --dep-cc=emcc --extra-cflags="$CFLAGS" --extra-cxxflags="$CXXFLAGS" --extra-ldflags="$LDFLAGS" \
    $( [ $MODE = st ] && echo --disable-pthreads --disable-w32threads --disable-os2threads ) \
    --disable-everything --disable-network --disable-postproc \
    --enable-protocol=file,pipe \
    --enable-demuxer=mov,matroska,avi,mpegts,mp3,wav,aac,ogg,flac,h264,hevc,m4v,amr,mjpeg \
    --enable-decoder=h264,hevc,mpeg4,h263,vp8,vp9,mjpeg,prores,mpeg2video,mpeg1video,aac,aac_latm,mp3,mp3float,mp2,opus,vorbis,flac,alac,ac3,eac3,amrnb,amrwb,pcm_s16le,pcm_s16be,pcm_s24le,pcm_s32le,pcm_f32le,pcm_u8,pcm_mulaw,pcm_alaw \
    --enable-encoder=libopenh264,aac,pcm_s16le,pcm_f32le,mjpeg \
    --enable-muxer=mp4,mov,wav,null,pcm_f32le,pcm_s16le,image2 \
    --enable-parser=h264,hevc,aac,aac_latm,mpeg4video,vp8,vp9,opus,vorbis,ac3,mpegaudio,flac,mjpeg \
    --enable-bsf=h264_mp4toannexb,hevc_mp4toannexb,aac_adtstoasc,extract_extradata,vp9_superframe,null,setts \
    --enable-filter=scale,trim,atrim,setpts,asetpts,aresample,aformat,format,fps,null,anull,transpose,hflip,vflip,rotate,pad,crop,copy,settb,asettb,pan,volume,apad,anullsrc,concat,select,aselect \
    --enable-swscale --enable-swresample --enable-libopenh264
  grep -E "CONFIG_GPL=|CONFIG_NONFREE=|CONFIG_VERSION3=|CONFIG_LIBOPENH264_ENCODER=" ffbuild/config.mak > $B/license-$MODE.txt || true
  emmake make -j8
fi
echo "== link $MODE"
cd $SRC && rm -rf src && mkdir -p src && cp -a $B/fw/src/bind $B/fw/src/fftools src/
OUT=$B/out-$MODE; mkdir -p $OUT
MEM=$( [ $MODE = mt ] && echo "-sINITIAL_MEMORY=1024MB -sPTHREAD_POOL_SIZE=8" || echo "-sINITIAL_MEMORY=32MB -sALLOW_MEMORY_GROWTH -sMAXIMUM_MEMORY=2GB" )
emcc -I. -I./src/fftools -I$INSTALL_DIR/include -L$INSTALL_DIR/lib -Llibavcodec -Llibavdevice -Llibavfilter -Llibavformat -Llibavutil -Llibswresample -Llibswscale \
  -lavcodec -lavdevice -lavfilter -lavformat -lavutil -lswresample -lswscale -lopenh264 -Wno-deprecated-declarations $LDFLAGS \
  -sWASM_BIGINT -sUSE_SDL=2 -sMODULARIZE $MEM -sEXPORT_NAME=createFFmpegCore -sEXPORT_ES6 -sENVIRONMENT=web,worker,node \
  -sEXPORTED_FUNCTIONS=$(node src/bind/ffmpeg/export.js) -sEXPORTED_RUNTIME_METHODS=$(node src/bind/ffmpeg/export-runtime.js) -lworkerfs.js \
  --pre-js src/bind/ffmpeg/bind.js \
  src/fftools/cmdutils.c src/fftools/ffmpeg.c src/fftools/ffmpeg_filter.c src/fftools/ffmpeg_hw.c src/fftools/ffmpeg_mux.c src/fftools/ffmpeg_opt.c src/fftools/opt_common.c \
  -o $OUT/ffmpeg-core.js
ls -la $OUT
echo BUILD_OK_$MODE
