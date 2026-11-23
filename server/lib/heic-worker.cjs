'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const fs=require('node:fs/promises');
const decode=require('heic-decode');
const sharp=require('sharp');
(async()=>{
  const buffer=await fs.readFile(workerData.filename);
  const images=await decode.all({buffer});
  try {
    const image=images[0];
    if(!image || images.length>10 || image.width*image.height>60*1000*1000)throw new Error('Image dimensions exceed limits.');
    const data=await image.decode();
    await sharp(Buffer.from(data.data.buffer,data.data.byteOffset,data.data.byteLength),{raw:{width:data.width,height:data.height,channels:4},limitInputPixels:60*1000*1000})
      .resize({width:280,height:208,fit:'inside',withoutEnlargement:true}).jpeg({quality:78}).toFile(workerData.target);
  } finally {images.dispose();}
  parentPort.postMessage({ok:true});
})().catch(()=>parentPort.postMessage({ok:false}));
