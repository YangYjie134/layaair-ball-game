// 告诉 TypeScript：运行时会存在一个全局 Laya 对象
// 防止 VSCode 报“找不到名称 Laya”
declare var Laya: any;

// 从 Laya 中取出 regClass 和 property
// regClass：注册脚本类
// property：暴露属性到编辑器（这里暂时没用到）
const { regClass, property } = Laya;
import { BackgroundManager } from "./BackgroundManager";
import { ScoreManager } from "./ScoreManager";
// 注册脚本类
// 让 Laya 编辑器能够识别这个脚本
@regClass()

// 创建 Main 类
// 继承 Laya.Script 后才能挂载到节点上
export class Main extends Laya.Script {

    // 脚本启动时执行一次
    // 类似于游戏的 BeginPlay、Start
    onStart() {
        console.log("Main onStart");
        BackgroundManager.draw(this.owner);
        ScoreManager.instance.init();
        // 在浏览器控制台输出文字
        // 用来测试脚本是否成功运行
        console.log("Game start");
    }
}
