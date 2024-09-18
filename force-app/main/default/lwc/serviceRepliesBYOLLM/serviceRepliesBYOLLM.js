import { LightningElement, wire, track, api } from 'lwc'
import { subscribe, APPLICATION_SCOPE, MessageContext } from 'lightning/messageService'
import { getRecord, getFieldValue, updateRecord } from 'lightning/uiRecordApi'
import ConversationEndUserChannel from '@salesforce/messageChannel/lightning__conversationEndUserMessage'
import ConversationAgentSendChannel from '@salesforce/messageChannel/lightning__conversationAgentSend'
import resolvePrompt from '@salesforce/apex/PromptResolutionTemplateController.resolvePrompt'
import AI_GEN from '@salesforce/schema/MessagingSession.AI_Responses_Generated__c'
import AI_USED from '@salesforce/schema/MessagingSession.AI_Responses_Used__c'
import MS_ID from '@salesforce/schema/MessagingSession.Id'

export default class ServiceRepliesBYOLLM extends LightningElement {
	// VARIABLES
	subscriptionUser = null
	subscriptionAgent = null

	@api recordId
	@api contextPromptId
	@api summaryPromptId
	@api refinementPromptId

	@wire(MessageContext) messageContextUser
	@wire(MessageContext) messageContextAgent
	@wire(getRecord, {
		recordId: '$recordId',
		fields: [AI_GEN, AI_USED]
	})
	session

	@track unansweredMessages = []
	@track showRefine = false
	@track refinement = ''
	@track generating = false
	@track generatedReply = {
		prompt: '',
		response: '',
		source: '',
		time: 0
	}

	get AIResponsesGenerated() {
		return getFieldValue(this.session.data, AI_GEN)
	}

	get AIResponsesUsed() {
		return getFieldValue(this.session.data, AI_USED)
	}

	inclusionList = ['order', 'delivery']

	// GETTERS / SETTERS
	get genReply() {
		return this.generatedReply.response.length === 0
	}

	get replyDisabled() {
		return this.generatedReply.response.length !== 0 || this.generating === true
	}

	// LIFECYCLE FUNCTIONS
	connectedCallback() {
		this.subscribeToUserMessageChannel()
		this.subscribeToAgentMessageChannel()
	}

	// EVENT HANDLERS

	handleMessage(message) {
		this.unansweredMessages.push(message.content)
		if (message.content.split(' ').length >= 5 || message.content.includes(this.inclusionList.some((v) => message.content.includes(v)))) {
			this.handleGenerateReply({ target: { value: 'Context' } })
		}
	}

	handleGenerateReply(event) {
		let templateInputs
		let inputsJSON
		let source = event.target.value
		let start = Date.now()
		templateInputs = [
			{ input: 'Messaging_Session', isObject: true, value: this.recordId },
			{ input: 'Content', isObject: false, value: this.unifyAnsweredMessages() }
		]
		inputsJSON = JSON.stringify(templateInputs)
		switch (source) {
			case 'Context':
				this.resolveReplyPrompt(this.contextPromptId, inputsJSON, source, start)
				break
			case 'Summary':
				this.resolveReplyPrompt(this.summaryPromptId, inputsJSON, source, start)
				break
			default:
				console.log('Nothing selected')
		}
	}
	handleShowRefine() {
		let currentShowRf = this.showRefine
		this.showRefine = !currentShowRf
	}

	handleRefinement(event) {
		this.refinement = event.target.value
	}

	handleRefinePrompt() {
		let templateInputs
		let inputsJSON
		templateInputs = [
			{ input: 'Prompt', isObject: false, value: this.generatedReply.prompt },
			{
				input: 'Response',
				isObject: false,
				value: this.generatedReply.response
			},
			{ input: 'Refinement', isObject: false, value: this.refinement }
		]
		inputsJSON = JSON.stringify(templateInputs)
		this.generating = true
		let start = Date.now()
		resolvePrompt({
			templateId: this.refinementPromptId,
			templateInputsJSON: inputsJSON
		})
			.then((data) => {
				let end = Date.now()
				this.generatedReply.response = data.response
				this.generatedReply.prompt = data.prompt
				this.generatedReply.time = (((end - start) % 60000) / 1000).toFixed(2)
				this.refinement = ''
				this.showRefine = false
				this.generating = false
			})
			.catch((error) => {
				console.log('error', error)
			})
	}

	async handleSetInput() {
		const toolKit = this.refs.lwcToolKitApi
		await toolKit.setAgentInput(this.recordId, { text: this.generatedReply.response })
		this.updateAICounts('Used')
	}

	async handleSendReply() {
		const toolKit = this.refs.lwcToolKitApi
		await toolKit.sendTextMessage(this.recordId, { text: this.generatedReply.response })
	}

	handleAgentMessage() {
		this.unansweredMessages = []
		this.generatedReply = {
			prompt: '',
			response: '',
			source: ''
		}
	}

	// HELPER FUNCTIONS
	subscribeToUserMessageChannel() {
		if (!this.subscriptionUser) {
			this.subscriptionUser = subscribe(this.messageContextUser, ConversationEndUserChannel, (message) => this.handleMessage(message), { scope: APPLICATION_SCOPE })
		}
	}
	subscribeToAgentMessageChannel() {
		if (!this.subscriptionAgent) {
			this.subscriptionAgent = subscribe(this.messageContextAgent, ConversationAgentSendChannel, () => this.handleAgentMessage(), { scope: APPLICATION_SCOPE })
		}
	}

	resolveReplyPrompt(template, input, source, start) {
		this.generating = true
		resolvePrompt({ templateId: template, templateInputsJSON: input })
			.then((data) => {
				let end = Date.now()
				this.generatedReply = {
					prompt: data.prompt,
					response: data.response,
					source: source,
					time: (((end - start) % 60000) / 1000).toFixed(2)
				}
				this.generating = false
				this.updateAICounts('Generated')
			})
			.catch((error) => {
				console.log('error', error)
			})
	}

	unifyAnsweredMessages() {
		let unifiedMsgs = ''
		if (this.unansweredMessages.length === 0) {
			unifiedMsgs = '(blank)'
		} else {
			this.unansweredMessages.forEach((msg) => {
				const regex = /[!.?](?:\s+)?$(?<=)/gm
				let lastDigit = msg.charAt(msg.length - 1)
				if (!regex.test(lastDigit)) {
					msg += '. '
				}
				unifiedMsgs += msg
			})
		}
		return unifiedMsgs
	}

	updateAICounts(source) {
		const fields = {}
		fields[MS_ID.fieldApiName] = this.recordId
		if (source === 'Generated') {
			let newVal = this.AIResponsesGenerated + 1
			fields[AI_GEN.fieldApiName] = newVal
		} else if (source === 'Used') {
			let newVal = this.AIResponsesUsed + 1
			fields[AI_GEN.fieldApiName] = newVal
		}
		const recordInput = { fields }
		updateRecord(recordInput)
	}
}
