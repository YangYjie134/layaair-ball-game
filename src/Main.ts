// 告诉 TypeScript：运行时会存在一个全局 Laya 对象，以避免编辑器提示未定义
// 这类注释用于说明当前脚本依赖运行时环境
declare var Laya: any;

// 从 Laya 中取出 regClass 和 property
// regClass 用于注册脚本类，property 用于暴露编辑器属性（当前未使用）
const { regClass, property } = Laya;
// 背景管理器负责在场景启动时绘制背景与装饰效果
import { BackgroundManager } from "./BackgroundManager";
// 分数管理器负责维护分数、胜负状态和界面显示
import { ScoreManager } from "./ScoreManager";
import { IntroUI } from "./IntroUI";
import { BgmManager } from "./BgmManager";
// 使用 regClass 注册脚本类，让 Laya 编辑器能够识别当前脚本
@regClass()

// 创建 Main 类，继承 Laya.Script 后才能挂载到场景节点上
export class Main extends Laya.Script {

    // 脚本启动时执行一次，类似游戏的开始函数
    onStart() {
        console.log("Main onStart");
        BackgroundManager.draw(this.owner);
        ScoreManager.instance.init();
        IntroUI.show();
        Laya.stage.on(Laya.Event.KEY_DOWN, this, this.onStartBgmKeyDown);
        // 在浏览器控制台输出文字
        // 用来测试脚本是否成功运行
        console.log("Game start");
    }

    private onStartBgmKeyDown(event: any): void {
        const keyCode = event ? event.keyCode : null;
        const key = event ? event.key : "";
        const isStartKey = keyCode === 32 || key === " " || key === "Space";
        if (!isStartKey) {
            return;
        }

        Laya.stage.off(Laya.Event.KEY_DOWN, this, this.onStartBgmKeyDown);
        BgmManager.playBgm();
    }
}
