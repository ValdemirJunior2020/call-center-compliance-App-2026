export function routeQuestion(mode, question) {
  if (!mode) {
    return {
      answer:
        "Please select a document before submitting your question.",
      source: "System Rule",
    };
  }

  return {
    answer:
      "I'm sorry, that information is not covered in our official documentation.",
    source: mode,
  };
}
