from rag_pipeline import LocalRAG


# Adjust score based on strict judging criteria
def adjust_score(judgment_text):
    try:
        score_line = judgment_text.split("\n")[0]
        score_str = score_line.split(":")[1].strip().replace("%", "")
        score = float(score_str)
    except Exception as e:
        print("⚠️ Score parsing failed:", judgment_text)
        return 0

    if "Faithful: No" in judgment_text:
        score -= 15 # 30(Strict) ,15 if you want to be more lenient

    if "Correct: No" in judgment_text:
        score -= 20 #30(Strict) , 20 if you want to be more lenient
    elif "Correct: Partial" in judgment_text:
        score -= 10 # 10(Strict) , 5 if you want to be more lenient

    return max(score, 0)


# Enhanced evaluation with strict judging and verification using LLM
def evaluate(rag):
    print("\n📊 Running STRICT Evaluation...\n")

    total_score = 0

    for test in test_cases:
        print(f"\n❓ Question: {test['question']}")

        # Retrieve context
        docs, metas = rag.retrieve(test["question"])
        context = "\n\n".join(docs)

        # Generate answer
        predicted = rag.ask(test["question"], docs, metas)

        # Judge evaluation
        judgment = rag.judge_answer(
            test["question"],
            predicted,
            context,
            test["answer"]
        )

        # Verification check
        verification = rag.verify_answer(predicted, context)

        # Adjust score
        score = adjust_score(judgment)

        if "supported: no" in verification.lower():
            score -= 25

        score = max(score, 0)

        # Print results
        print(f"\n🤖 Answer:\n{predicted}")
        print(f"\n⚖️ Judge:\n{judgment}")
        print(f"\n🔍 Verification: {verification}")
        print(f"\n📈 Final Score: {score}")

        total_score += score

    avg = total_score / len(test_cases)
    print(f"\n🏁 Final Accuracy: {avg:.2f}%")


test_cases = [
    {
        "question": "What are punishments under Section 53?",
        "answer": "Qisas, Diyat, Arsh, Daman, Ta'zir, Death, Imprisonment for life, Rigorous imprisonment, Simple imprisonment, Forfeiture of property, Fine"
    },
    {
        "question": "Can death sentence be commuted without consent?",
        "answer": "Yes, but not in qatl cases without consent of heirs"
    },
    {
        "question": "How is life imprisonment calculated?",
        "answer": "Life imprisonment is considered as 25 years"
    },
    {
        "question": "What happens if fine is partially paid?",
        "answer": "Imprisonment may be reduced proportionally"
    }
]


if __name__ == "__main__":
    rag = LocalRAG()
    evaluate(rag)

    while True:
        query = input("\n💬 Ask a legal question (or 'exit'): ")
        if query.lower() == "exit":
            break

        answer = rag.ask(query)
        print("\n🤖 Answer:\n", answer)