import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

// 不要な表情をリセットするためのリスト
const EMOTION_KEYS = ['neutral', 'happy', 'angry', 'sad', 'relaxed', 'surprised', 'blink', 'blinkLeft', 'blinkRight'];

export default function VrmViewer({ 
  isSpeaking, 
  positionX = 0, 
  positionY = -0.5, 
  currentExpression = 'neutral'
}) {
  const containerRef = useRef(null);
  const vrmRef = useRef(null); // ロードされたVRMを保持
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const frameIdRef = useRef(null); // アニメーションループID

  // --- 1. 初期化とロード (初回のみ実行) ---
  useEffect(() => {
    // シーン作成
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // カメラ
    const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 20.0);
    camera.position.set(0.0, 1.4, 2.0); // 初期カメラ位置
    cameraRef.current = camera;

    // レンダラー
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    rendererRef.current = renderer;

    if (containerRef.current) {
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(renderer.domElement);
    }

    // ライト
    const light = new THREE.DirectionalLight(0xffffff, 1.0);
    light.position.set(1.0, 1.0, 1.0).normalize();
    scene.add(light);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // VRMロード
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      '/model.vrm', 
      (gltf) => {
        const vrm = gltf.userData.vrm;
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.removeUnnecessaryJoints(gltf.scene);

        vrm.scene.rotation.y = Math.PI; // 正面に向ける
        scene.add(vrm.scene);
        vrmRef.current = vrm;

        // ★★★ 腕を下ろすポーズ (ロード時に適用) ★★★
        const humanoid = vrm.humanoid;
        if (humanoid) {
            // 75度〜80度くらい下げる
            const leftArm = humanoid.getNormalizedBoneNode('leftUpperArm');
            if (leftArm) leftArm.rotation.z = 1.4; 
            
            const rightArm = humanoid.getNormalizedBoneNode('rightUpperArm');
            if (rightArm) rightArm.rotation.z = -1.4; 
        }

        console.log("VRM Loaded Successfully");
      },
      (progress) => {
        console.log('Loading...', 100.0 * (progress.loaded / progress.total), '%');
      },
      (error) => {
        console.error("VRM Load Error:", error);
      }
    );

    // リサイズ対応
    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current) return;
      cameraRef.current.aspect = window.innerWidth / window.innerHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // クリーンアップ
    return () => {
      window.removeEventListener('resize', handleResize);
      if (rendererRef.current) rendererRef.current.dispose();
      if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current);
    };
  }, []);


  // --- 2. 位置の反映 (positionX, Y が変わったら即実行) ---
  useEffect(() => {
    if (vrmRef.current) {
        vrmRef.current.scene.position.x = positionX;
        vrmRef.current.scene.position.y = positionY;
    }
  }, [positionX, positionY]);


  // --- 3. 表情の反映 (currentExpression が変わったら即実行) ---
  useEffect(() => {
    if (!vrmRef.current) return;
    const manager = vrmRef.current.expressionManager;
    
    // 全リセット
    EMOTION_KEYS.forEach(key => manager.setValue(key, 0));

    // 新しい表情セット (neutral以外)
    if (currentExpression && currentExpression !== 'neutral') {
        manager.setValue(currentExpression, 1.0);
    }
  }, [currentExpression]);


  // --- 4. アニメーションループ (毎フレーム実行) ---
  // isSpeaking の状態をここで監視するために Ref を使う
  const isSpeakingRef = useRef(isSpeaking);
  useEffect(() => {
      isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    const clock = new THREE.Clock();

    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate);
      
      const delta = clock.getDelta();
      const time = clock.elapsedTime;

      // VRMがあれば更新
      if (vrmRef.current) {
        vrmRef.current.update(delta);

        // 呼吸モーション (位置はここで上書きせず、現在のY座標に加算する形にするのが理想だが簡易的に回転だけ)
        const humanoid = vrmRef.current.humanoid;
        if(humanoid) {
          const spine = humanoid.getNormalizedBoneNode('spine');
          if (spine) {
            spine.rotation.x = Math.sin(time * 1.5) * 0.03; 
          }
        }

        // 口パク制御 (Refの値を見る)
        const manager = vrmRef.current.expressionManager;
        if (isSpeakingRef.current) {
           // ★★★ 口パク速度調整: 20 -> 12 に減速 ★★★
           const s = Math.sin(time * 12) * 0.4 + 0.4;
           manager.setValue('aa', s);
        } else {
           manager.setValue('aa', 0);
        }

        // まばたき (ランダム)
        // 表情が指定されているときもまばたきさせたい場合はここを残す
        if (Math.random() < 0.005) {
             manager.setValue('blink', 1.0);
             setTimeout(() => {
                 // 非同期実行時にvrmRefが消えてる可能性を考慮
                 if(vrmRef.current) vrmRef.current.expressionManager.setValue('blink', 0.0);
             }, 150);
        }
      }

      // レンダリング
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
         rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    
    // アニメーション開始
    animate();

    return () => {
        if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current);
    };
  }, []); // 初回のみ起動

  return <div ref={containerRef} className="vrm-canvas" />;
}