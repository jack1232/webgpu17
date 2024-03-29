import { InitGPU, CreateGPUBuffer, CreateTransforms, CreateViewProjection, CreateAnimation } from './helper';
import shader from './shader.wgsl';
import { vec3, vec4, mat4 } from 'gl-matrix';
const createCamera = require('3d-view-controls');

export interface LightInputs {
    color?: vec3;
    ambientIntensity?: number;
    diffuseIntensity?: number;
    specularIntensity?: number;
    shininess?: number;
    specularColor?: vec3;
} 

export const CreateShapeWithLight = async (vertexData: Float32Array, normalData: Float32Array, 
    li:LightInputs, isAnimation = true) => {
    const gpu = await InitGPU();
    const device = gpu.device;

    // define default parameters for th elight model
    li.color = li.color == undefined ? [1.0,0.0,0.0] : li.color;
    li.ambientIntensity = li.ambientIntensity == undefined ? 0.2 : li.ambientIntensity;
    li.diffuseIntensity = li.diffuseIntensity == undefined ? 0.8 : li.diffuseIntensity;
    li.specularIntensity = li.specularIntensity == undefined ? 0.4 : li.specularIntensity;
    li.shininess = li.shininess == undefined ? 30.0 : li.shininess;
    li.specularColor = li.specularColor == undefined ? [1.0, 1.0, 1.0] : li.specularColor;
    
    // create vertex buffers
    const numberOfVertices = vertexData.length/3;
    const vertexBuffer = CreateGPUBuffer(device, vertexData);
    const normalBuffer = CreateGPUBuffer(device, normalData);

    const pipeline = device.createRenderPipeline({
        layout:'auto',
        vertex: {
            module: device.createShaderModule({                    
                code: shader
            }),
            entryPoint: "vs_main",
            buffers:[
                {
                    arrayStride: 12,
                    attributes: [{
                        shaderLocation: 0,
                        format: "float32x3",
                        offset: 0
                    }]
                },
                {
                    arrayStride: 12,
                    attributes: [{
                        shaderLocation: 1,
                        format: "float32x3",
                        offset: 0
                    }]
                }
            ]
        },
        fragment: {
            module: device.createShaderModule({                    
                code: shader
            }),
            entryPoint: "fs_main",
            targets: [
                {
                    format: gpu.format as GPUTextureFormat
                }
            ]
        },
        primitive:{
            topology: "triangle-list",
        },
        depthStencil:{
            format: "depth24plus",
            depthWriteEnabled: true,
            depthCompare: "less"
        }
    });
 
    // create uniform data
    const normalMatrix = mat4.create();
    const modelMatrix = mat4.create();
    let vMatrix = mat4.create();
    let vpMatrix = mat4.create();
    const vp = CreateViewProjection(gpu.canvas.width/gpu.canvas.height);
    vpMatrix = vp.viewProjectionMatrix;

    // add rotation and camera:
    let rotation = vec3.fromValues(0, 0, 0);       
    var camera = createCamera(gpu.canvas, vp.cameraOption);
    let eyePosition = new Float32Array(vp.cameraOption.eye);
    let lightPosition = eyePosition;

    // create uniform buffer and layout
    const vertexUniformBuffer = device.createBuffer({
        size: 192,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    const fragmentUniformBuffer = device.createBuffer({
        size: 32,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    var lightParams = [] as any;
    lightParams.push([li.color, 1.0]);
    lightParams.push([li.specularColor, 1.0]);
    lightParams.push([li.ambientIntensity, li.diffuseIntensity, li.specularIntensity, li.shininess]);

    const lightUniformBuffer = device.createBuffer({
        size: 48,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    if(isAnimation){
        device.queue.writeBuffer(vertexUniformBuffer, 0, vp.viewProjectionMatrix as ArrayBuffer);
        device.queue.writeBuffer(fragmentUniformBuffer, 0, lightPosition);
        device.queue.writeBuffer(fragmentUniformBuffer, 16, eyePosition);
    }
    device.queue.writeBuffer(lightUniformBuffer, 0, new Float32Array(lightParams.flat()));
  
    const uniformBindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: vertexUniformBuffer,
                    offset: 0,
                    size: 192
                }
            },
            {
                binding: 1,
                resource: {
                    buffer: fragmentUniformBuffer,
                    offset: 0,
                    size: 32
                }
            },
            {
                binding: 2,
                resource: {
                    buffer: lightUniformBuffer,
                    offset: 0,
                    size: 48
                }
            }                       
        ]
    });

    let textureView = gpu.context.getCurrentTexture().createView();
    const depthTexture = device.createTexture({
        size: [gpu.canvas.width, gpu.canvas.height, 1],
        format: "depth24plus",
        usage: GPUTextureUsage.RENDER_ATTACHMENT
    });

    const renderPassDescription = {
        colorAttachments: [{
            view: textureView,
            clearValue: { r: 0.2, g: 0.247, b: 0.314, a: 1.0 }, //background color
            //loadValue: { r: 0.2, g: 0.247, b: 0.314, a: 1.0 }, 
            loadOp: 'clear',
            storeOp: 'store'
        }],
        depthStencilAttachment: {
            view: depthTexture.createView(),
            depthClearValue: 1.0,
            depthLoadValue: 1.0,
            depthStoreOp: "store",
            depthLoadOp: 'clear',
            /*stencilClearValue: 0,
            stencilLoadValue: 0,
            stencilStoreOp: "store",           
            stencilLoadOp: 'clear'*/
        }
    };
    
    function draw() {
        if(!isAnimation){
            if(camera.tick()){
                const pMatrix = vp.projectionMatrix;
                vMatrix = camera.matrix;
                mat4.multiply(vpMatrix, pMatrix, vMatrix);

                eyePosition = new Float32Array(camera.eye.flat());
                lightPosition = eyePosition;
                device.queue.writeBuffer(vertexUniformBuffer, 0, vpMatrix as ArrayBuffer);
                device.queue.writeBuffer(fragmentUniformBuffer, 0, eyePosition);
                device.queue.writeBuffer(fragmentUniformBuffer, 16, lightPosition);
            }
        }

        CreateTransforms(modelMatrix,[0,0,0], rotation);
        mat4.invert(normalMatrix, modelMatrix);
        mat4.transpose(normalMatrix, normalMatrix);
        device.queue.writeBuffer(vertexUniformBuffer, 64, modelMatrix as ArrayBuffer);
        device.queue.writeBuffer(vertexUniformBuffer, 128, normalMatrix as ArrayBuffer);

        textureView = gpu.context.getCurrentTexture().createView();
        renderPassDescription.colorAttachments[0].view = textureView;
        const commandEncoder = device.createCommandEncoder();
        const renderPass = commandEncoder.beginRenderPass(renderPassDescription as GPURenderPassDescriptor);

        renderPass.setPipeline(pipeline);
        renderPass.setVertexBuffer(0, vertexBuffer);
        renderPass.setVertexBuffer(1, normalBuffer);
        renderPass.setBindGroup(0, uniformBindGroup);       
        renderPass.draw(numberOfVertices);
        renderPass.end();

        device.queue.submit([commandEncoder.finish()]);
    }

    CreateAnimation(draw, rotation, isAnimation);
}