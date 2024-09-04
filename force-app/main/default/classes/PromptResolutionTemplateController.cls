public with sharing class PromptResolutionTemplateController {
  @AuraEnabled
  public static PromptResponseWrapper resolvePrompt(
    string templateId,
    string templateInputsJSON
  ) {
    PromptResponseWrapper promptResponse = new PromptResponseWrapper();
    List<PromptInputWrapper> templateInputs = (List<PromptInputWrapper>) JSON.deserialize(
      templateInputsJSON,
      List<PromptInputWrapper>.class
    );

    ConnectApi.EinsteinPromptTemplateGenerationsInput promptGenerationsInput = new ConnectApi.EinsteinPromptTemplateGenerationsInput();

    Map<String, ConnectApi.WrappedValue> valueMap = new Map<String, ConnectApi.WrappedValue>();

    try {
      for (PromptInputWrapper pi : templateInputs) {
        ConnectApi.WrappedValue inputWrappedValue = new ConnectApi.WrappedValue();
        if (pi.isObject) {
          Map<String, String> idMap = new Map<String, String>();
          idMap.put('id', pi.value);
          inputWrappedValue.value = idMap;
        } else {
          inputWrappedValue.value = pi.value;
        }
        string inputName = 'Input:' + pi.input;
        valueMap.put(inputName, inputWrappedValue);
      }

      promptGenerationsInput.inputParams = valueMap;
      promptGenerationsInput.additionalConfig = new ConnectApi.EinsteinLlmAdditionalConfigInput();
      promptGenerationsInput.additionalConfig.numGenerations = 1;
      promptGenerationsInput.additionalConfig.applicationName = 'PromptTemplateGenerationsInvocable';
      promptGenerationsInput.isPreview = false;

      ConnectApi.EinsteinPromptTemplateGenerationsRepresentation generationsOutput = ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate(
        templateId,
        promptGenerationsInput
      );
      ConnectApi.EinsteinLLMGenerationItemOutput response = generationsOutput.generations[0];

      promptResponse.response = response.text;
      promptResponse.prompt = generationsOutput.prompt;

      return promptResponse;
    } catch (Exception e) {
      promptResponse.error = e.getMessage();
      system.debug(promptResponse.error);
      return promptResponse;
    }
  }

  public class PromptInputWrapper {
    @AuraEnabled
    public string input { get; set; }
    @AuraEnabled
    public boolean isObject { get; set; }
    @AuraEnabled
    public string value { get; set; }
  }

  public class PromptResponseWrapper {
    @AuraEnabled
    public string response { get; set; }
    @AuraEnabled
    public string prompt { get; set; }
    @AuraEnabled
    public string error { get; set; }
  }
}
