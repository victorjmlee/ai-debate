#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI Debate CLI - Multi-Model Edition
Claude vs GPT-4o vs Gemini 동시 비교

지원 모델:
- Claude (Anthropic) - Sonnet 4, Opus 4
- GPT-4o (OpenAI)
- Gemini (Google)
"""

import os
import sys

# ============================================================================
# Venv 자동 설정 (--setup 시 패키지 설치 없이 실행 가능)
# ============================================================================
if __name__ == "__main__" and "--setup" in sys.argv:
    import subprocess
    import venv
    from pathlib import Path

    VENV_DIR = Path(__file__).parent / ".venv"
    REQUIREMENTS = ["anthropic", "openai", "google-genai", "rich"]

    print(f"📦 가상환경 생성 중: {VENV_DIR}")
    sys.stdout.flush()
    venv.create(VENV_DIR, clear=True, with_pip=True)

    pip = VENV_DIR / "bin" / "pip"
    if sys.platform == "win32":
        pip = VENV_DIR / "Scripts" / "pip.exe"

    print(f"📥 패키지 설치 중: {', '.join(REQUIREMENTS)}")
    sys.stdout.flush()
    subprocess.check_call(
        [str(pip), "install", "--upgrade", "pip"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    subprocess.check_call(
        [str(pip), "install"] + REQUIREMENTS,
        stdout=subprocess.DEVNULL,
    )

    python = VENV_DIR / "bin" / "python"
    if sys.platform == "win32":
        python = VENV_DIR / "Scripts" / "python.exe"

    print("\n✅ 설치 완료! 이제 바로 실행할 수 있습니다:")
    print(f"   python3 {Path(__file__).name}")
    sys.exit(0)

# ============================================================================
# Venv 자동 활성화: .venv가 있으면 자동으로 해당 Python으로 재실행
# ============================================================================
if __name__ == "__main__":
    from pathlib import Path

    _venv_python = Path(__file__).parent / ".venv" / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
    if _venv_python.exists() and sys.prefix == sys.base_prefix:
        os.execv(str(_venv_python), [str(_venv_python)] + sys.argv)

# ============================================================================
# 이하 일반 실행
# ============================================================================
from typing import Dict, List, Optional
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor, as_completed

# ============================================================================
# API 키 설정 (환경변수)
# ============================================================================
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")  # Gemini

# ============================================================================
# 패키지 import (있는 것만)
# ============================================================================
available_models = {}

# Claude
try:
    from anthropic import Anthropic
    if ANTHROPIC_API_KEY:
        available_models['claude-sonnet'] = True
        available_models['claude-opus'] = True
except ImportError:
    pass

# OpenAI
try:
    from openai import OpenAI
    if OPENAI_API_KEY:
        available_models['gpt-4'] = True
except ImportError:
    pass

# Gemini
try:
    from google import genai
    if GOOGLE_API_KEY:
        available_models['gemini'] = True
except ImportError:
    pass

# Rich UI
try:
    from rich.console import Console
    from rich.panel import Panel
    from rich.columns import Columns
    from rich.markdown import Markdown
    from rich.table import Table
    from rich.prompt import Prompt, Confirm
except ImportError:
    print("❌ rich 패키지를 설치해주세요: pip install rich")
    sys.exit(1)


# ============================================================================
# Model 응답 클래스
# ============================================================================
@dataclass
class ModelResponse:
    model_name: str
    answer: str
    error: Optional[str] = None
    tokens_used: Optional[int] = None


# ============================================================================
# AI Models Manager
# ============================================================================
class AIModels:
    """여러 AI 모델 통합 관리"""
    
    def __init__(self):
        self.console = Console()
        
        # 클라이언트 초기화 (패키지가 설치되어 있을 때만)
        self.claude_client = Anthropic(api_key=ANTHROPIC_API_KEY) if ('claude-sonnet' in available_models or 'claude-opus' in available_models) else None
        self.openai_client = OpenAI(api_key=OPENAI_API_KEY) if 'gpt-4' in available_models else None
        self.gemini_client = genai.Client(api_key=GOOGLE_API_KEY) if 'gemini' in available_models else None
        
        # 사용 가능한 모델 표시
        self.show_available_models()
    
    def show_available_models(self):
        """사용 가능한 모델 표시"""
        table = Table(title="🤖 사용 가능한 AI 모델")
        table.add_column("모델", style="cyan")
        table.add_column("상태", style="green")
        table.add_column("비고")
        
        models_info = {
            'claude-sonnet': ('Claude Sonnet 4', '최신, 균형잡힌 성능'),
            'claude-opus': ('Claude Opus 4', '최고 성능, 느림'),
            'gpt-4': ('GPT-4o', 'OpenAI 최고 모델'),
            'gemini': ('Gemini 2.0 Flash', 'Google, 무료 티어'),
        }
        
        for model, (name, desc) in models_info.items():
            status = "✅" if model in available_models else "❌"
            table.add_row(name, status, desc)
        
        self.console.print(table)
    
    def ask_claude(self, prompt: str, model: str = "claude-sonnet-4-20250514") -> ModelResponse:
        """Claude에게 질문"""
        if not self.claude_client:
            return ModelResponse("Claude", "", error="API 키 없음")
        
        try:
            response = self.claude_client.messages.create(
                model=model,
                max_tokens=4000,
                messages=[{"role": "user", "content": prompt}]
            )
            return ModelResponse(
                model_name=f"Claude ({model.split('-')[1].capitalize()})",
                answer=response.content[0].text,
                tokens_used=response.usage.input_tokens + response.usage.output_tokens
            )
        except Exception as e:
            return ModelResponse("Claude", "", error=str(e))
    
    def ask_gpt4(self, prompt: str) -> ModelResponse:
        """GPT-4o에게 질문"""
        if not self.openai_client:
            return ModelResponse("GPT-4o", "", error="API 키 없음")

        try:
            response = self.openai_client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=4000
            )
            return ModelResponse(
                model_name="GPT-4o",
                answer=response.choices[0].message.content,
                tokens_used=response.usage.total_tokens
            )
        except Exception as e:
            return ModelResponse("GPT-4o", "", error=str(e))
    
    def ask_gemini(self, prompt: str) -> ModelResponse:
        """Gemini에게 질문"""
        if not self.gemini_client:
            return ModelResponse("Gemini", "", error="API 키 없음")

        try:
            response = self.gemini_client.models.generate_content(
                model='gemini-2.0-flash',
                contents=prompt,
            )
            return ModelResponse(
                model_name="Gemini 2.0 Flash",
                answer=response.text,
                tokens_used=None
            )
        except Exception as e:
            return ModelResponse("Gemini", "", error=str(e))
    
    def ask_all(self, prompt: str, selected_models: List[str] = None) -> Dict[str, ModelResponse]:
        """선택된 모든 모델에게 동시 질문"""
        if selected_models is None:
            selected_models = list(available_models.keys())

        model_funcs = {
            'claude-sonnet': lambda: self.ask_claude(prompt, "claude-sonnet-4-20250514"),
            'claude-opus': lambda: self.ask_claude(prompt, "claude-opus-4-20250514"),
            'gpt-4': lambda: self.ask_gpt4(prompt),
            'gemini': lambda: self.ask_gemini(prompt),
        }

        responses = {}

        with self.console.status(f"[bold green]{len(selected_models)}개 AI 모델에게 질문 중..."):
            with ThreadPoolExecutor(max_workers=len(selected_models)) as executor:
                futures = {
                    executor.submit(model_funcs[model]): model
                    for model in selected_models
                    if model in model_funcs
                }
                for future in as_completed(futures):
                    model_key = futures[future]
                    try:
                        responses[model_key] = future.result()
                    except Exception as e:
                        responses[model_key] = ModelResponse(model_key, "", error=str(e))

        return responses


# ============================================================================
# AI Debate System
# ============================================================================
class MultiAIDebate:
    """다중 AI 모델 토론 시스템"""
    
    def __init__(self):
        self.console = Console()
        self.ai = AIModels()
        self.history = []
    
    def select_models(self) -> List[str]:
        """사용할 모델 선택"""
        self.console.print("\n[bold cyan]어떤 모델들을 비교하시겠어요?[/bold cyan]")
        self.console.print("(기본: 사용 가능한 모든 모델)")
        
        options = []
        for i, model in enumerate(available_models.keys(), 1):
            options.append(f"{i}. {model}")
        
        self.console.print("\n".join(options))
        self.console.print("0. 전체 선택")
        
        choice = Prompt.ask("\n선택 (쉼표로 구분, 엔터=전체)", default="0")
        
        if choice == "0" or not choice.strip():
            return list(available_models.keys())
        
        try:
            indices = [int(x.strip()) - 1 for x in choice.split(",")]
            models = list(available_models.keys())
            return [models[i] for i in indices if 0 <= i < len(models)]
        except Exception:
            return list(available_models.keys())
    
    def show_responses(self, responses: Dict[str, ModelResponse], title: str = "답변"):
        """여러 답변을 패널로 표시"""
        self.console.print(f"\n[bold magenta]{title}[/bold magenta]")
        self.console.print("=" * 80)
        
        panels = []
        colors = {
            'claude-sonnet': 'blue',
            'claude-opus': 'cyan',
            'gpt-4': 'green',
            'gemini': 'yellow'
        }
        
        for model_key, response in responses.items():
            if response.error:
                content = f"[red]❌ 에러: {response.error}[/red]"
            else:
                content = response.answer
                if response.tokens_used:
                    content += f"\n\n[dim]토큰: {response.tokens_used}[/dim]"
            
            panel = Panel(
                Markdown(content) if not response.error else content,
                title=f"🤖 {response.model_name}",
                border_style=colors.get(model_key, 'white'),
                padding=(1, 2)
            )
            panels.append(panel)
        
        # 2열로 표시
        if len(panels) <= 2:
            self.console.print(Columns(panels))
        else:
            # 3개 이상이면 순서대로
            for panel in panels:
                self.console.print(panel)
    
    def cross_review(self, responses: Dict[str, ModelResponse]) -> Dict[str, ModelResponse]:
        """서로 리뷰"""
        self.console.print("\n[bold cyan]🔄 Round 2: 상호 리뷰[/bold cyan]")
        
        # 각 모델의 답변 요약
        all_answers = "\n\n".join([
            f"=== {resp.model_name} ===\n{resp.answer}"
            for resp in responses.values()
            if not resp.error
        ])
        
        review_prompt = f"""다른 AI들의 답변:

{all_answers}

당신의 답변과 비교하여:
1. 다른 AI들의 좋은 점
2. 당신 답변의 개선점
3. 모든 답변을 통합한 최고의 답변

을 작성해주세요."""
        
        # 각 모델이 다른 모델들 답변 보고 리뷰
        review_responses = self.ai.ask_all(review_prompt, list(responses.keys()))
        
        return review_responses
    
    def synthesize(self, review_responses: Dict[str, ModelResponse]) -> str:
        """Claude로 최종 통합"""
        self.console.print("\n[bold cyan]✨ Final: 통합 답변 생성 (by Claude)[/bold cyan]")
        
        all_reviews = "\n\n".join([
            f"=== {resp.model_name}의 최종 의견 ===\n{resp.answer}"
            for resp in review_responses.values()
            if not resp.error
        ])
        
        synthesis_prompt = f"""여러 AI 모델들의 최종 의견:

{all_reviews}

모든 AI들의 의견을 종합하여:
1. 공통적으로 동의하는 핵심 내용
2. 각자의 독특한 인사이트
3. 통합된 최고의 최종 답변

을 작성해주세요. 중복은 제거하고 보완적인 내용을 합쳐주세요."""
        
        # Claude로 통합 (Claude가 제일 잘함)
        if 'claude-sonnet' in available_models:
            final_response = self.ai.ask_claude(synthesis_prompt)
        elif 'claude-opus' in available_models:
            final_response = self.ai.ask_claude(synthesis_prompt, "claude-opus-4-20250514")
        else:
            # Claude 없으면 GPT-4
            final_response = self.ai.ask_gpt4(synthesis_prompt)

        if final_response.error:
            self.console.print(Panel(
                f"[red]통합 답변 생성 실패: {final_response.error}[/red]",
                title="✨ 최종 통합 답변",
                border_style="red",
                padding=(1, 2)
            ))
            return None

        self.console.print(Panel(
            Markdown(final_response.answer),
            title="✨ 최종 통합 답변",
            border_style="yellow",
            padding=(1, 2)
        ))

        return final_response.answer
    
    def run(self, question: str, auto_mode: bool = False):
        """전체 토론 실행"""
        # 헤더
        self.console.print(Panel(
            f"[bold]질문:[/bold] {question}",
            title="🎯 Multi-AI Debate",
            border_style="magenta",
            padding=(1, 2)
        ))
        
        # 모델 선택
        if not auto_mode:
            selected_models = self.select_models()
        else:
            selected_models = list(available_models.keys())
        
        if not selected_models:
            self.console.print("[red]선택된 모델이 없습니다.[/red]")
            return
        
        self.console.print(f"\n[green]선택된 모델: {', '.join(selected_models)}[/green]")
        
        # Round 1: 초기 답변
        self.console.print("\n[bold cyan]🎯 Round 1: 초기 답변[/bold cyan]")
        initial_responses = self.ai.ask_all(question, selected_models)
        self.history.append({'round': 1, 'responses': initial_responses})
        self.show_responses(initial_responses, "Round 1: 초기 답변")
        
        # 계속?
        if not auto_mode:
            if not Confirm.ask("\n계속 진행?", default=True):
                return
        
        # Round 2: 상호 리뷰
        review_responses = self.cross_review(initial_responses)
        self.history.append({'round': 2, 'responses': review_responses})
        self.show_responses(review_responses, "Round 2: 상호 리뷰")
        
        # 통합?
        if not auto_mode:
            if not Confirm.ask("\n통합 답변 생성?", default=True):
                return
        
        # Final: 통합
        final = self.synthesize(review_responses)
        
        return final


# ============================================================================
# 메인
# ============================================================================
def main():
    console = Console()
    
    console.print("""
[bold magenta]╔═══════════════════════════════════════════════════╗
║     Multi-AI Debate CLI v1.0                      ║
║     Claude vs GPT-4o vs Gemini                    ║
╚═══════════════════════════════════════════════════╝[/bold magenta]
    """)
    
    # 사용 가능한 모델 체크
    if not available_models:
        console.print("[red]❌ 사용 가능한 AI 모델이 없습니다![/red]")
        console.print("\nAPI 키를 설정해주세요:")
        console.print("  export ANTHROPIC_API_KEY='...'")
        console.print("  export OPENAI_API_KEY='...'")
        console.print("  export GOOGLE_API_KEY='...'")
        return
    
    debate = MultiAIDebate()
    
    # 질문 받기
    if len(sys.argv) > 1:
        question = " ".join(sys.argv[1:])
        auto = True
    else:
        question = Prompt.ask("\n[bold cyan]질문을 입력하세요[/bold cyan]")
        auto = False
    
    if not question.strip():
        console.print("[red]질문을 입력해주세요.[/red]")
        return
    
    try:
        debate.run(question, auto_mode=auto)
    except KeyboardInterrupt:
        console.print("\n\n[yellow]중단되었습니다.[/yellow]")
    except Exception as e:
        console.print(f"\n[red]에러 발생: {e}[/red]")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
