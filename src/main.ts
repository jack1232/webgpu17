import { CreateWireframe } from './wireframe';
import { TorusWireframeData } from './vertex_data';
import { vec3 } from 'gl-matrix';
import $ from 'jquery';

const Create3DObject = async (R:number,r:number, N:number, n:number, center:vec3, isAnimation:boolean) => {
    const wireframeData = TorusWireframeData(R, r, N, n, center) as Float32Array;
    await CreateWireframe(wireframeData, isAnimation);
}

let R= 2;
let r = 0.5;
let N = 30;
let n = 15;
let center:vec3 = [0,0,0];
let isAnimation = true;

Create3DObject(R, r, N, n, center, isAnimation);

$('#id-radio input:radio').on('click', function(){
    let val = $('input[name="options"]:checked').val();
    if(val === 'animation') isAnimation = true;
    else isAnimation = false;
    Create3DObject(R, r, N, n, center, isAnimation);
});

$('#btn-redraw').on('click', function(){
    const val = $('#id-center').val();
    center = val?.toString().split(',').map(Number) as vec3;
    R = parseFloat($('#id-rlarge').val()?.toString() as string);
    r = parseFloat($('#id-rsmall').val()?.toString() as string);
    N = parseFloat($('#id-nlarge').val()?.toString() as string);
    n = parseInt($('#id-nsmall').val()?.toString() as string);
    Create3DObject(R, r, N, n, center, isAnimation);
});